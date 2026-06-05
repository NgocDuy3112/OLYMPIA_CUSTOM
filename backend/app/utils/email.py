"""Async email utilities for Olympia Custom.

Sends transactional emails (e.g. login credentials) via SMTP using aiosmtplib.
All public functions are fire-and-forget safe — they log errors instead of raising.
"""
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from configs import EmailSettings
from logger import global_logger

_email_settings: EmailSettings | None = None


def _get_settings() -> EmailSettings:
    global _email_settings
    if _email_settings is None:
        _email_settings = EmailSettings()
    return _email_settings


async def _send(subject: str, html_body: str, to: str) -> None:
    """Internal: build and send one email."""
    cfg = _get_settings()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg.EMAIL_FROM_NAME} <{cfg.SMTP_USER}>"
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=cfg.SMTP_HOST,
        port=cfg.SMTP_PORT,
        username=cfg.SMTP_USER,
        password=cfg.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_credentials_email(
    *,
    to: str,
    user_name: str,
    user_code: str,
    password: str,
) -> None:
    """Send login credentials to a newly created user.

    Called right after account creation so the plaintext password is still
    available. Non-blocking: failures are logged and swallowed so they never
    break the signup response.
    """
    subject = "[Olympia Custom] Thông tin đăng nhập của bạn"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #1e293b; background: #f8fafc; padding: 24px;">
        <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,.1); padding: 32px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; text-align: center;">
                <strong style="font-size: 14px;">🚀 PHIÊN BẢN BETA</strong><br/>
                <span style="font-size: 12px; opacity: 0.9;">Cảm ơn bạn đã tham gia thử nghiệm!</span>
            </div>
            <h2 style="color: #2563eb; margin-top: 0;">Thông tin đăng nhập</h2>
            <p>Xin chào <strong>{user_name}</strong>,</p>
            <p>Tài khoản Olympia Custom của bạn đã được tạo thành công. Dưới đây là thông tin đăng nhập:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                <tr>
                    <td style="padding: 10px 14px; background: #f1f5f9; font-weight: bold;
                               border-radius: 6px 0 0 6px; width: 40%">Mã người dùng</td>
                    <td style="padding: 10px 14px; background: #e0f2fe; font-family: monospace;
                               border-radius: 0 6px 6px 0;">{user_code}</td>
                </tr>
                <tr><td colspan="2" style="padding: 4px;"></td></tr>
                <tr>
                    <td style="padding: 10px 14px; background: #f1f5f9; font-weight: bold;
                               border-radius: 6px 0 0 6px;">Mật khẩu</td>
                    <td style="padding: 10px 14px; background: #e0f2fe; font-family: monospace;
                               border-radius: 0 6px 6px 0;">{password}</td>
                </tr>
            </table>
            <p style="color: #64748b; font-size: 13px;">
                Vui lòng giữ bí mật thông tin này. Nếu bạn không đăng ký tài khoản này,
                hãy liên hệ ban tổ chức ngay.
            </p>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Trân trọng,<br/>Ban tổ chức Olympia Custom</p>
        </div>
    </body>
    </html>
    """
    try:
        await _send(subject, html_body, to)
        global_logger.info(f"Credentials email sent to {to} for user_code={user_code}")
    except Exception:
        global_logger.exception(
            f"Failed to send credentials email to {to} for user_code={user_code}"
        )


async def send_credentials_email_safe(
    *,
    to: str,
    user_name: str,
    user_code: str,
    password: str,
) -> None:
    """Await directly so errors surface in logs immediately.
    Failures are caught and logged but never raise to the caller."""
    try:
        cfg = _get_settings()
        global_logger.info(
            f"Attempting to send credentials email via {cfg.SMTP_HOST}:{cfg.SMTP_PORT} "
            f"as {cfg.SMTP_USER} to {to}"
        )
    except Exception as cfg_err:
        global_logger.error(
            f"EmailSettings could not be loaded — SMTP credentials missing from .env: {cfg_err}",
            exc_info=True,
        )
        return

    try:
        await send_credentials_email(
            to=to,
            user_name=user_name,
            user_code=user_code,
            password=password,
        )
    except Exception:
        global_logger.exception(f"send_credentials_email_safe: failed to send to {to}")


async def send_password_reset_email(*, to: str, user_name: str, reset_link: str) -> None:
    subject = "[Olympia Custom] Đặt lại mật khẩu"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #1e293b; background: #f8fafc; padding: 24px;">
        <div style="max-width: 540px; margin: auto; background: #fff; border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,.1); padding: 28px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; text-align: center;">
                <strong style="font-size: 14px;">🚀 PHIÊN BẢN BETA</strong><br/>
                <span style="font-size: 12px; opacity: 0.9;">Cảm ơn bạn đã tham gia thử nghiệm!</span>
            </div>
            <h2 style="color: #2563eb; margin-top: 0;">Yêu cầu đặt lại mật khẩu</h2>
            <p>Xin chào <strong>{user_name}</strong>,</p>
            <p>Bạn hoặc quản trị viên đã yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn nút bên dưới để đặt mật khẩu mới. Link sẽ hết hạn sau 1 giờ.</p>
            <div style="text-align:center; margin: 20px 0;">
                <a href="{reset_link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;">Đặt lại mật khẩu</a>
            </div>
            <p style="color:#64748b;font-size:13px;">Nếu bạn không gửi yêu cầu này, bỏ qua email này hoặc liên hệ ban tổ chức.</p>
            <p style="color:#64748b;font-size:13px;margin-bottom:0;">Trân trọng,<br/>Ban tổ chức Olympia Custom</p>
        </div>
    </body>
    </html>
    """
    try:
        await _send(subject, html_body, to)
        global_logger.info(f"Password reset email sent to {to}")
    except Exception:
        global_logger.exception(f"Failed to send password reset email to {to}")


async def send_password_reset_email_safe(*, to: str, user_name: str, reset_link: str) -> None:
    try:
        await send_password_reset_email(to=to, user_name=user_name, reset_link=reset_link)
    except Exception:
        global_logger.exception(f"send_password_reset_email_safe: failed to send to {to}")


async def send_otp_email(*, to: str, user_name: str, otp: str, purpose: str) -> None:
    subject = f"[Olympia Custom] Mã xác thực ({purpose})"
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #1e293b; background: #f8fafc; padding: 24px;">
        <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,.1); padding: 32px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; text-align: center;">
                <strong style="font-size: 14px;">🚀 PHIÊN BẢN BETA</strong><br/>
                <span style="font-size: 12px; opacity: 0.9;">Cảm ơn bạn đã tham gia thử nghiệm!</span>
            </div>
            <h2 style="color: #2563eb; margin-top: 0;">Mã xác thực</h2>
            <p>Xin chào <strong>{user_name}</strong>,</p>
            <p>Mã xác thực cho thao tác <strong>{purpose}</strong> của bạn là:</p>
            <div style="font-family: monospace; font-size: 22px; color: #111827; background:#eef2ff; padding:12px 16px; border-radius:8px; text-align:center;">{otp}</div>
            <p style="color: #64748b; font-size: 13px;">Mã này có hiệu lực trong vài phút. Nếu bạn không yêu cầu mã, hãy bỏ qua email này.</p>
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Trân trọng,<br/>Ban tổ chức Olympia Custom</p>
        </div>
    </body>
    </html>
    """
    try:
        await _send(subject, html_body, to)
        global_logger.info(f"OTP email sent to {to}")
    except Exception:
        global_logger.exception(f"Failed to send OTP email to {to}")


async def send_otp_email_safe(*, to: str, user_name: str, otp: str, purpose: str) -> None:
    try:
        await send_otp_email(to=to, user_name=user_name, otp=otp, purpose=purpose)
    except Exception:
        global_logger.exception(f"send_otp_email_safe: failed to send to {to}")
