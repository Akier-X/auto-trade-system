"""
Short-Term Trading Dashboard
Real-time monitoring for short-term trading strategy.
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

# Page config
st.set_page_config(
    page_title="Short-Term Trading Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)


class ShortTermDashboard:
    """Dashboard for short-term trading strategy."""

    def __init__(self):
        """Initialize dashboard."""
        self.db = get_db_manager()

    def get_active_positions(self):
        """Get active short-term positions."""
        query = """
            SELECT * FROM v_active_short_term_positions
            ORDER BY holding_hours ASC
        """

        results = self.db.execute_query(query)

        return pd.DataFrame([dict(r) for r in results])

    def get_today_trades(self):
        """Get today's closed trades."""
        query = """
            SELECT
                th.ticker_code,
                th.entry_price,
                th.exit_price,
                th.pnl,
                th.pnl_percentage,
                th.exit_date,
                tm.holding_hours,
                tm.entry_signal_score
            FROM trade_history th
            JOIN trade_metadata tm ON th.id = tm.trade_id
            WHERE th.status = 'CLOSED'
              AND tm.strategy_type = 'short_term'
              AND DATE(th.exit_date) = CURRENT_DATE
            ORDER BY th.exit_date DESC
        """

        results = self.db.execute_query(query)

        return pd.DataFrame([dict(r) for r in results])

    def get_performance_summary(self, days=30):
        """Get performance summary."""
        query = """
            SELECT
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losing_trades,
                ROUND(AVG(pnl_percentage), 2) as avg_return_pct,
                SUM(pnl) as total_pnl,
                MAX(pnl) as best_trade,
                MIN(pnl) as worst_trade,
                ROUND(AVG(EXTRACT(EPOCH FROM (exit_date - entry_date)) / 3600), 1) as avg_holding_hours
            FROM trade_history th
            JOIN trade_metadata tm ON th.id = tm.trade_id
            WHERE th.status = 'CLOSED'
              AND tm.strategy_type = 'short_term'
              AND th.exit_date >= NOW() - INTERVAL '%s days'
        """

        result = self.db.execute_query(query, (days,))

        if result and result[0]['total_trades']:
            return dict(result[0])

        return {}

    def get_daily_performance(self, days=30):
        """Get daily performance data."""
        query = """
            SELECT * FROM v_short_term_performance
            WHERE trade_date >= CURRENT_DATE - INTERVAL '%s days'
            ORDER BY trade_date ASC
        """

        results = self.db.execute_query(query, (days,))

        return pd.DataFrame([dict(r) for r in results])

    def get_signal_performance(self):
        """Get performance by signal strength."""
        query = """
            SELECT * FROM v_signal_performance
        """

        results = self.db.execute_query(query)

        return pd.DataFrame([dict(r) for r in results])

    def get_recent_signals(self, limit=20):
        """Get recent trading signals."""
        query = """
            SELECT
                ticker_code,
                signal_type,
                signal_score,
                confidence,
                is_executed,
                created_at
            FROM intraday_signals
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT %s
        """

        results = self.db.execute_query(query, (limit,))

        return pd.DataFrame([dict(r) for r in results])

    def render(self):
        """Render dashboard."""
        st.title("⚡ Short-Term Trading Dashboard")
        st.caption("Day Trading & Swing Trading Monitor")

        # Sidebar
        with st.sidebar:
            st.header("⚙️ Settings")

            refresh = st.button("🔄 Refresh Data")

            st.divider()

            st.header("📊 Time Range")
            days = st.slider("Days to display", 1, 90, 30)

            st.divider()

            st.info(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Performance Summary
        st.header("📈 Performance Summary")

        summary = self.get_performance_summary(days=days)

        if summary:
            col1, col2, col3, col4, col5 = st.columns(5)

            with col1:
                total_trades = summary.get('total_trades', 0)
                st.metric("Total Trades", total_trades)

            with col2:
                win_rate = (summary.get('winning_trades', 0) / total_trades * 100) if total_trades > 0 else 0
                st.metric("Win Rate", f"{win_rate:.1f}%")

            with col3:
                total_pnl = summary.get('total_pnl', 0)
                st.metric("Total P&L", f"¥{total_pnl:,.0f}")

            with col4:
                avg_return = summary.get('avg_return_pct', 0)
                st.metric("Avg Return", f"{avg_return:+.2f}%")

            with col5:
                avg_holding = summary.get('avg_holding_hours', 0)
                st.metric("Avg Hold Time", f"{avg_holding:.1f}h")

        # Active Positions
        st.header("🎯 Active Positions")

        positions = self.get_active_positions()

        if not positions.empty:
            st.dataframe(
                positions[[
                    'ticker_code', 'entry_price', 'quantity',
                    'holding_hours', 'entry_signal_score'
                ]].rename(columns={
                    'ticker_code': 'Ticker',
                    'entry_price': 'Entry Price',
                    'quantity': 'Qty',
                    'holding_hours': 'Hold (h)',
                    'entry_signal_score': 'Signal Score'
                }),
                use_container_width=True
            )

            # Highlight positions approaching max hold time
            max_hold = 120  # 5 days
            expiring = positions[positions['holding_hours'] >= max_hold * 0.8]

            if not expiring.empty:
                st.warning(f"⚠️ {len(expiring)} position(s) approaching max hold time")

        else:
            st.info("No active positions")

        # Today's Trades
        st.header("📜 Today's Trades")

        today_trades = self.get_today_trades()

        if not today_trades.empty:
            today_trades['color'] = today_trades['pnl'].apply(
                lambda x: '🟢' if x > 0 else '🔴'
            )

            st.dataframe(
                today_trades[[
                    'color', 'ticker_code', 'entry_price', 'exit_price',
                    'pnl', 'pnl_percentage', 'holding_hours'
                ]].rename(columns={
                    'color': '',
                    'ticker_code': 'Ticker',
                    'entry_price': 'Entry',
                    'exit_price': 'Exit',
                    'pnl': 'P&L',
                    'pnl_percentage': 'Return %',
                    'holding_hours': 'Hold (h)'
                }),
                use_container_width=True
            )

            # Today's summary
            today_pnl = today_trades['pnl'].sum()
            today_wins = len(today_trades[today_trades['pnl'] > 0])
            today_total = len(today_trades)

            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Today's P&L", f"¥{today_pnl:,.0f}")
            with col2:
                st.metric("Today's Trades", today_total)
            with col3:
                today_wr = (today_wins / today_total * 100) if today_total > 0 else 0
                st.metric("Today's Win Rate", f"{today_wr:.1f}%")

        else:
            st.info("No trades today")

        # Daily Performance Chart
        st.header("📊 Daily Performance")

        daily_perf = self.get_daily_performance(days=days)

        if not daily_perf.empty:
            col1, col2 = st.columns(2)

            with col1:
                # P&L Chart
                fig = go.Figure()

                fig.add_trace(go.Bar(
                    x=daily_perf['trade_date'],
                    y=daily_perf['total_pnl'],
                    name='Daily P&L',
                    marker_color=daily_perf['total_pnl'].apply(
                        lambda x: '#00C851' if x > 0 else '#ff4444'
                    )
                ))

                fig.update_layout(
                    title="Daily P&L",
                    xaxis_title="Date",
                    yaxis_title="P&L (¥)",
                    hovermode='x unified',
                    height=400
                )

                st.plotly_chart(fig, use_container_width=True)

            with col2:
                # Win Rate Chart
                daily_perf['win_rate'] = (daily_perf['wins'] / daily_perf['trades'] * 100)

                fig = go.Figure()

                fig.add_trace(go.Scatter(
                    x=daily_perf['trade_date'],
                    y=daily_perf['win_rate'],
                    mode='lines+markers',
                    name='Win Rate',
                    line=dict(color='#00D9FF', width=2)
                ))

                fig.add_hline(y=50, line_dash="dash", line_color="gray")

                fig.update_layout(
                    title="Daily Win Rate",
                    xaxis_title="Date",
                    yaxis_title="Win Rate (%)",
                    hovermode='x unified',
                    height=400
                )

                st.plotly_chart(fig, use_container_width=True)

        # Signal Performance
        st.header("🎯 Signal Performance Analysis")

        signal_perf = self.get_signal_performance()

        if not signal_perf.empty:
            col1, col2 = st.columns(2)

            with col1:
                # Performance by signal strength
                fig = px.bar(
                    signal_perf,
                    x='signal_strength',
                    y='avg_return_pct',
                    title='Avg Return by Signal Strength',
                    labels={'signal_strength': 'Signal Strength', 'avg_return_pct': 'Avg Return (%)'},
                    color='avg_return_pct',
                    color_continuous_scale='RdYlGn'
                )

                st.plotly_chart(fig, use_container_width=True)

            with col2:
                # Trade count by signal strength
                fig = px.pie(
                    signal_perf,
                    values='total_trades',
                    names='signal_strength',
                    title='Trades by Signal Strength'
                )

                st.plotly_chart(fig, use_container_width=True)

        # Recent Signals
        st.header("🔔 Recent Signals (24h)")

        signals = self.get_recent_signals(limit=20)

        if not signals.empty:
            signals['status'] = signals['is_executed'].apply(
                lambda x: '✅ Executed' if x else '⏳ Pending'
            )

            st.dataframe(
                signals[[
                    'ticker_code', 'signal_type', 'signal_score',
                    'confidence', 'status', 'created_at'
                ]].rename(columns={
                    'ticker_code': 'Ticker',
                    'signal_type': 'Signal',
                    'signal_score': 'Score',
                    'confidence': 'Confidence',
                    'status': 'Status',
                    'created_at': 'Time'
                }),
                use_container_width=True
            )

        else:
            st.info("No recent signals")


def main():
    """Main entry point."""
    dashboard = ShortTermDashboard()
    dashboard.render()


if __name__ == '__main__':
    main()
