"""
RMHealth Authentication Service (M1 + M8)

Handles: registration, login, 2FA, JWT tokens, password management, rate limiting.
Security: bcrypt salt:12, JWT 24h access / 7d refresh, 2FA via SendGrid.

© 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
"""

import hashlib
import logging
import os
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import bcrypt
import jwt

logger = logging.getLogger("RMHealth.Auth")

# ── Configuration ──
JWT_SECRET = os.getenv("JWT_SECRET_KEY") or os.getenv("JWT_SECRET", "rmhealth-jwt-secret-change-in-production-2026")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRY = timedelta(hours=24)
REFRESH_TOKEN_EXPIRY = timedelta(days=7)
TWO_FACTOR_EXPIRY = timedelta(minutes=10)
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
BCRYPT_ROUNDS = 12

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@rmhealth.app")


# ── Password Hashing ──

def hash_password(password: str) -> str:
    """Hash password with bcrypt salt:12. Never store plaintext."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ── Password Validation ──

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Validate password meets requirements:
    - Minimum 8 characters
    - At least 1 uppercase letter
    - At least 1 number
    """
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres"
    if not any(c.isupper() for c in password):
        return False, "La contraseña debe tener al menos 1 letra mayúscula"
    if not any(c.isdigit() for c in password):
        return False, "La contraseña debe tener al menos 1 número"
    return True, "OK"


# ── JWT Token Management ──

def create_access_token(user_id: str, email: str, role: str) -> str:
    """Create a signed JWT access token (24h expiry)."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRY,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> Tuple[str, str]:
    """
    Create a refresh token (7d expiry).
    Returns (raw_token, token_hash) — store hash in DB, send raw to client.
    """
    raw_token = "".join(random.choices(string.ascii_letters + string.digits, k=64))
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token. Returns payload or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"JWT invalid: {e}")
        return None


def verify_refresh_token_hash(raw_token: str, stored_hash: str) -> bool:
    """Verify a refresh token against its stored SHA-256 hash."""
    computed = hashlib.sha256(raw_token.encode()).hexdigest()
    return computed == stored_hash


# ── Two-Factor Authentication ──

def generate_2fa_code() -> str:
    """Generate a 6-digit 2FA verification code."""
    return "".join(random.choices(string.digits, k=6))


def send_2fa_email(email: str, code: str, full_name: str) -> bool:
    """
    Send 2FA verification code via SendGrid.
    Falls back to logging if SendGrid is not configured.
    """
    if not SENDGRID_API_KEY:
        logger.warning(f"[2FA] SendGrid not configured. Code for {email}: {code}")
        return True  # Allow dev flow without email

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=SENDGRID_FROM_EMAIL,
            to_emails=email,
            subject="RMHealth — Código de Verificación",
            html_content=f"""
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3BAFAA, #1B4F72); padding: 24px; border-radius: 16px 16px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">🏥 RMHealth</h1>
                </div>
                <div style="background: #FFFFFF; padding: 32px; border: 1px solid #E2E8F0; border-radius: 0 0 16px 16px;">
                    <p style="color: #334155; font-size: 16px;">Hola <strong>{full_name}</strong>,</p>
                    <p style="color: #64748B;">Tu código de verificación es:</p>
                    <div style="background: #F8FAFC; border: 2px solid #3BAFAA; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #1B4F72;">{code}</span>
                    </div>
                    <p style="color: #94A3B8; font-size: 13px;">Este código expira en 10 minutos.</p>
                    <p style="color: #94A3B8; font-size: 13px;">Si no solicitaste este código, ignora este correo.</p>
                </div>
                <p style="color: #CBD5E1; font-size: 11px; text-align: center; margin-top: 16px;">
                    © 2025 RMHealth — Monitoreo de Salud Personal
                </p>
            </div>
            """,
        )

        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f"[2FA] Email sent to {email}, status: {response.status_code}")
        return response.status_code in (200, 201, 202)

    except Exception as e:
        logger.error(f"[2FA] Failed to send email: {e}")
        return False


# ── Rate Limiting ──

def is_account_locked(locked_until: Optional[datetime]) -> bool:
    """Check if an account is currently locked."""
    if locked_until is None:
        return False
    return datetime.now(timezone.utc) < locked_until


def should_lock_account(failed_attempts: int) -> bool:
    """Check if failed attempts have exceeded the threshold."""
    return failed_attempts >= MAX_LOGIN_ATTEMPTS


def get_lockout_until() -> datetime:
    """Get the lockout expiration timestamp."""
    return datetime.now(timezone.utc) + LOCKOUT_DURATION


# ── Database Operations ──

class AuthDB:
    """Database operations for the auth service. Uses raw psycopg2 cursor."""

    @staticmethod
    def create_user(cursor, email: str, password: str, full_name: str, role: str = "PACIENTE") -> dict:
        """Register a new user. Returns user dict or raises."""
        password_hash = hash_password(password)

        cursor.execute("""
            INSERT INTO users (email, password_hash, full_name, role)
            VALUES (%s, %s, %s, %s)
            RETURNING id, email, full_name, role, email_verified, created_at
        """, (email.lower().strip(), password_hash, full_name.strip(), role))

        row = cursor.fetchone()
        return {
            "id": str(row["id"]),
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role"],
            "email_verified": row["email_verified"],
            "created_at": row["created_at"].isoformat(),
        }

    @staticmethod
    def find_user_by_email(cursor, email: str) -> Optional[dict]:
        """Find user by email. Returns full user row or None."""
        cursor.execute("SELECT * FROM users WHERE email = %s", (email.lower().strip(),))
        return cursor.fetchone()

    @staticmethod
    def find_user_by_id(cursor, user_id: str) -> Optional[dict]:
        """Find user by UUID."""
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        return cursor.fetchone()

    @staticmethod
    def set_2fa_code(cursor, user_id: str, code: str):
        """Store 2FA code with expiration."""
        expires = datetime.now(timezone.utc) + TWO_FACTOR_EXPIRY
        cursor.execute("""
            UPDATE users SET two_factor_code = %s, two_factor_expires_at = %s
            WHERE id = %s
        """, (code, expires, user_id))

    @staticmethod
    def verify_2fa_code(cursor, user_id: str, code: str) -> bool:
        """Verify 2FA code and clear it if valid."""
        cursor.execute("""
            SELECT two_factor_code, two_factor_expires_at FROM users WHERE id = %s
        """, (user_id,))
        row = cursor.fetchone()
        if not row or not row["two_factor_code"]:
            return False

        now = datetime.now(timezone.utc)
        expires = row["two_factor_expires_at"]
        if expires and expires.tzinfo is None:
            from datetime import timezone as tz
            expires = expires.replace(tzinfo=tz.utc)

        if row["two_factor_code"] != code:
            return False
        if expires and now > expires:
            return False

        # Clear 2FA code after successful verification
        cursor.execute("""
            UPDATE users SET two_factor_code = NULL, two_factor_expires_at = NULL,
                             email_verified = TRUE
            WHERE id = %s
        """, (user_id,))
        return True

    @staticmethod
    def increment_failed_attempts(cursor, email: str):
        """Increment failed login counter. Lock if threshold reached."""
        cursor.execute("""
            UPDATE users SET failed_login_attempts = failed_login_attempts + 1
            WHERE email = %s
            RETURNING failed_login_attempts
        """, (email.lower().strip(),))
        row = cursor.fetchone()
        if row and should_lock_account(row["failed_login_attempts"]):
            cursor.execute("""
                UPDATE users SET locked_until = %s WHERE email = %s
            """, (get_lockout_until(), email.lower().strip()))

    @staticmethod
    def reset_failed_attempts(cursor, email: str):
        """Reset failed attempts on successful login."""
        cursor.execute("""
            UPDATE users SET failed_login_attempts = 0, locked_until = NULL
            WHERE email = %s
        """, (email.lower().strip(),))

    @staticmethod
    def store_refresh_token(cursor, user_id: str, token_hash: str):
        """Store refresh token hash in database."""
        expires = datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRY
        cursor.execute("""
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (%s, %s, %s)
        """, (user_id, token_hash, expires))

    @staticmethod
    def find_valid_refresh_token(cursor, user_id: str, token_hash: str) -> Optional[dict]:
        """Find a non-revoked, non-expired refresh token."""
        cursor.execute("""
            SELECT * FROM refresh_tokens
            WHERE user_id = %s AND token_hash = %s AND revoked = FALSE AND expires_at > NOW()
        """, (user_id, token_hash))
        return cursor.fetchone()

    @staticmethod
    def revoke_refresh_token(cursor, token_id: str):
        """Revoke a specific refresh token."""
        cursor.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE id = %s", (token_id,))

    @staticmethod
    def revoke_all_user_tokens(cursor, user_id: str):
        """Revoke all refresh tokens for a user (logout everywhere)."""
        cursor.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = %s", (user_id,))

    @staticmethod
    def log_login_attempt(cursor, email: str, success: bool, ip_address: str = None, user_agent: str = None):
        """Record login attempt for audit."""
        cursor.execute("""
            INSERT INTO login_attempts (email, success, ip_address, user_agent)
            VALUES (%s, %s, %s, %s)
        """, (email.lower().strip(), success, ip_address, user_agent))

    @staticmethod
    def update_password(cursor, user_id: str, new_password: str):
        """Update user password. Revokes all existing refresh tokens."""
        new_hash = hash_password(new_password)
        cursor.execute("""
            UPDATE users SET password_hash = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (new_hash, user_id))
        # Invalidate all sessions
        AuthDB.revoke_all_user_tokens(cursor, user_id)
