import { Router } from 'express';
import nodemailer from 'nodemailer';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';
import { addSystemLog } from './system';

export const emailRouter = Router();

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
  const secureFlag = process.env.SMTP_SECURE;
  const secure = secureFlag ? secureFlag.toLowerCase() === 'true' : port === 465;
  const from = process.env.SMTP_FROM || user;

  return { host, port, user, pass, secure, from };
};

emailRouter.post('/email/test', asyncHandler(async (req, res) => {
  const { to, subject, message } = req.body || {};

  validateRequired(req.body, ['to']);

  const smtp = getSmtpConfig();

  if (!smtp.host || !smtp.user || !smtp.pass) {
    throw new BadRequestError(
      'SMTP settings are missing',
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (and optionally SMTP_FROM).'
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject: subject || 'Auto Trade System - Notification Test',
    text: message || 'This is a test email from Auto Trade System.',
  });

  addSystemLog(`Email test sent to ${to}`, 'success');

  res.json(ApiResponse.success({
    messageId: info.messageId,
  }, 'Email test sent'));
}));
