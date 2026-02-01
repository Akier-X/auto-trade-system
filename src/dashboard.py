"""
Monitoring Dashboard
Real-time monitoring dashboard using Streamlit.
"""

import os
import sys
from datetime import datetime, timedelta

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage.db_manager import get_db_manager
from src.optimization.risk_manager import RiskManager

# Page config
st.set_page_config(
    page_title="Auto Trading System Dashboard",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)


class Dashboard:
    """Monitoring dashboard for auto trading system."""

    def __init__(self):
        """Initialize dashboard."""
        self.db = get_db_manager()

    def get_portfolio_metrics(self):
        """Get latest portfolio metrics."""
        query = """
            SELECT *
            FROM portfolio_mgmt
            ORDER BY snapshot_at DESC
            LIMIT 1
        """

        result = self.db.execute_query(query)

        if result:
            return dict(result[0])

        return {}

    def get_portfolio_history(self, days=30):
        """Get portfolio history."""
        query = """
            SELECT *
            FROM portfolio_mgmt
            WHERE snapshot_at >= NOW() - INTERVAL '%s days'
            ORDER BY snapshot_at ASC
        """

        results = self.db.execute_query(query, (days,))

        return pd.DataFrame([dict(r) for r in results])

    def get_open_positions(self):
        """Get open positions."""
        query = """
            SELECT
                th.*,
                sm.company_name
            FROM trade_history th
            LEFT JOIN stocks_master sm ON th.ticker_code = sm.ticker_code
            WHERE th.status = 'OPEN'
            ORDER BY th.entry_date DESC
        """

        results = self.db.execute_query(query)

        return pd.DataFrame([dict(r) for r in results])

    def get_recent_trades(self, limit=10):
        """Get recent closed trades."""
        query = """
            SELECT
                th.*,
                sm.company_name
            FROM trade_history th
            LEFT JOIN stocks_master sm ON th.ticker_code = sm.ticker_code
            WHERE th.status = 'CLOSED'
            ORDER BY th.exit_date DESC
            LIMIT %s
        """

        results = self.db.execute_query(query, (limit,))

        return pd.DataFrame([dict(r) for r in results])

    def get_consensus_decisions(self, days=7):
        """Get recent consensus decisions."""
        query = """
            SELECT
                fc.*,
                im.ticker_code,
                im.source_type,
                im.original_text
            FROM final_consensus fc
            JOIN intelligence_memory im ON fc.intelligence_id = im.id
            WHERE fc.created_at >= NOW() - INTERVAL '%s days'
            ORDER BY fc.created_at DESC
        """

        results = self.db.execute_query(query, (days,))

        return pd.DataFrame([dict(r) for r in results])

    def get_data_sources_stats(self):
        """Get data sources statistics."""
        query = """
            SELECT
                source_type,
                COUNT(*) as count,
                COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed_count
            FROM (
                SELECT 'tweets' as source_type, processed FROM raw_tweets
                UNION ALL
                SELECT 'news' as source_type, processed FROM raw_news
                UNION ALL
                SELECT 'reddit' as source_type, processed FROM raw_reddit
                UNION ALL
                SELECT 'tdnet' as source_type, processed FROM raw_tdnet
            ) sources
            GROUP BY source_type
        """

        results = self.db.execute_query(query)

        return pd.DataFrame([dict(r) for r in results])

    def render(self):
        """Render dashboard."""
        st.title("📈 Auto Trading System Dashboard")

        # Sidebar
        with st.sidebar:
            st.header("⚙️ Settings")

            refresh = st.button("🔄 Refresh Data")

            st.divider()

            st.header("📊 Time Range")
            days = st.slider("Days to display", 1, 90, 30)

            st.divider()

            st.info(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Main content
        metrics = self.get_portfolio_metrics()

        if metrics:
            # Portfolio Overview
            st.header("💼 Portfolio Overview")

            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric(
                    "Total Assets",
                    f"¥{metrics.get('total_assets', 0):,.0f}",
                    delta=f"{metrics.get('unrealized_pnl', 0):+,.0f}"
                )

            with col2:
                st.metric(
                    "Available Cash",
                    f"¥{metrics.get('available_cash', 0):,.0f}"
                )

            with col3:
                st.metric(
                    "Win Rate",
                    f"{metrics.get('win_rate', 0):.1f}%"
                )

            with col4:
                total_trades = metrics.get('total_trades', 0)
                winning_trades = metrics.get('winning_trades', 0)
                losing_trades = metrics.get('losing_trades', 0)

                st.metric(
                    "Total Trades",
                    f"{total_trades}",
                    delta=f"W:{winning_trades} L:{losing_trades}"
                )

            # Portfolio Chart
            st.subheader("📈 Portfolio Value History")

            history = self.get_portfolio_history(days=days)

            if not history.empty:
                fig = go.Figure()

                fig.add_trace(go.Scatter(
                    x=history['snapshot_at'],
                    y=history['total_assets'],
                    mode='lines+markers',
                    name='Total Assets',
                    line=dict(color='#00D9FF', width=2)
                ))

                fig.update_layout(
                    xaxis_title="Date",
                    yaxis_title="Value (¥)",
                    hovermode='x unified',
                    height=400
                )

                st.plotly_chart(fig, use_container_width=True)

        # Open Positions
        st.header("📊 Open Positions")

        positions = self.get_open_positions()

        if not positions.empty:
            # Calculate current P&L (simplified - would need current prices)
            positions['position_value'] = positions['quantity'] * positions['entry_price']
            positions['days_held'] = (datetime.now() - pd.to_datetime(positions['entry_date'])).dt.days

            st.dataframe(
                positions[[
                    'ticker_code', 'company_name', 'quantity',
                    'entry_price', 'position_value', 'days_held'
                ]].rename(columns={
                    'ticker_code': 'Ticker',
                    'company_name': 'Company',
                    'quantity': 'Qty',
                    'entry_price': 'Entry Price',
                    'position_value': 'Value',
                    'days_held': 'Days'
                }),
                use_container_width=True
            )

        else:
            st.info("No open positions")

        # Recent Trades
        st.header("📜 Recent Trades")

        trades = self.get_recent_trades(limit=10)

        if not trades.empty:
            trades['return_pct'] = trades['pnl_percentage']

            st.dataframe(
                trades[[
                    'ticker_code', 'company_name', 'entry_price',
                    'exit_price', 'pnl', 'return_pct', 'exit_date'
                ]].rename(columns={
                    'ticker_code': 'Ticker',
                    'company_name': 'Company',
                    'entry_price': 'Entry',
                    'exit_price': 'Exit',
                    'pnl': 'P&L',
                    'return_pct': 'Return %',
                    'exit_date': 'Date'
                }),
                use_container_width=True
            )

        else:
            st.info("No recent trades")

        # AI Consensus Decisions
        st.header("🤖 AI Consensus Decisions")

        decisions = self.get_consensus_decisions(days=7)

        if not decisions.empty:
            # Summary metrics
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                execute_count = len(decisions[decisions['final_decision'] == 'EXECUTE'])
                st.metric("EXECUTE", execute_count)

            with col2:
                watch_count = len(decisions[decisions['final_decision'] == 'WATCH'])
                st.metric("WATCH", watch_count)

            with col3:
                hold_count = len(decisions[decisions['final_decision'] == 'HOLD'])
                st.metric("HOLD", hold_count)

            with col4:
                reject_count = len(decisions[decisions['final_decision'] == 'REJECT'])
                st.metric("REJECT", reject_count)

            # Decision distribution
            fig = px.pie(
                decisions,
                names='final_decision',
                title='Decision Distribution',
                color_discrete_sequence=px.colors.qualitative.Set3
            )

            st.plotly_chart(fig, use_container_width=True)

        # Data Sources
        st.header("📥 Data Sources")

        sources = self.get_data_sources_stats()

        if not sources.empty:
            sources['processed_rate'] = (sources['processed_count'] / sources['count'] * 100).round(1)

            col1, col2 = st.columns(2)

            with col1:
                fig = px.bar(
                    sources,
                    x='source_type',
                    y='count',
                    title='Data by Source',
                    labels={'source_type': 'Source', 'count': 'Count'},
                    color='source_type'
                )

                st.plotly_chart(fig, use_container_width=True)

            with col2:
                fig = px.bar(
                    sources,
                    x='source_type',
                    y='processed_rate',
                    title='Processing Rate',
                    labels={'source_type': 'Source', 'processed_rate': 'Processed (%)'},
                    color='processed_rate',
                    color_continuous_scale='Blues'
                )

                st.plotly_chart(fig, use_container_width=True)


def main():
    """Main entry point."""
    dashboard = Dashboard()
    dashboard.render()


if __name__ == '__main__':
    main()
