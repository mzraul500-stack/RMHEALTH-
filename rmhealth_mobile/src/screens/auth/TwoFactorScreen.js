/**
 * TwoFactorScreen — RMHealth 2FA Verification (M1)
 *
 * 6-digit code input with auto-advance between fields.
 * 10-minute expiration timer.
 * Resend code functionality.
 *
 * © 2025 MORALES ZEPEDA RAUL
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

const CODE_LENGTH = 6;
const EXPIRY_SECONDS = 600; // 10 minutes

export function TwoFactorScreen({ userId, onSuccess, onBack }) {
  const { verify2FA, login: authLogin } = useAuth();

  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECONDS);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef([]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handleCodeChange = (text, index) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    setError('');

    // Auto-advance to next field
    if (text && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (text && index === CODE_LENGTH - 1) {
      const fullCode = newCode.join('');
      if (fullCode.length === CODE_LENGTH) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode) => {
    const codeStr = fullCode || code.join('');
    if (codeStr.length !== CODE_LENGTH) {
      setError('Ingresa el código completo de 6 dígitos');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await verify2FA(userId, codeStr);
      if (onSuccess) onSuccess();
    } catch (e) {
      setError(e.message || 'Código inválido o expirado');
      // Clear code on error
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = () => {
    // Reset timer and disable resend
    setTimeLeft(EXPIRY_SECONDS);
    setCanResend(false);
    setError('');
    setCode(Array(CODE_LENGTH).fill(''));
    inputRefs.current[0]?.focus();
    // The login endpoint already sends a new code
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          accessibilityLabel="Regresar a inicio de sesión"
        >
          <Text style={styles.backText}>← Regresar</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>🔐</Text>
          </View>
          <Text style={styles.title}>Verificación</Text>
          <Text style={styles.subtitle}>
            Ingresa el código de 6 dígitos que enviamos a tu correo
          </Text>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {/* Code Input */}
        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => (inputRefs.current[index] = ref)}
              style={[
                styles.codeInput,
                digit ? styles.codeInputFilled : null,
                error ? styles.codeInputError : null,
              ]}
              value={digit}
              onChangeText={(text) => handleCodeChange(text.replace(/[^0-9]/g, ''), index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              accessibilityLabel={`Dígito ${index + 1} del código de verificación`}
            />
          ))}
        </View>

        {/* Timer */}
        <View style={styles.timerContainer}>
          {timeLeft > 0 ? (
            <Text style={styles.timerText}>
              El código expira en <Text style={styles.timerBold}>{formatTime(timeLeft)}</Text>
            </Text>
          ) : (
            <Text style={styles.timerExpired}>El código ha expirado</Text>
          )}
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.disabledButton]}
          onPress={() => handleVerify()}
          disabled={isLoading}
          accessibilityLabel="Verificar código"
          accessibilityRole="button"
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>VERIFICAR</Text>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          style={[styles.resendButton, !canResend && styles.resendDisabled]}
          onPress={handleResend}
          disabled={!canResend}
          accessibilityLabel="Reenviar código de verificación"
        >
          <Text style={[styles.resendText, !canResend && styles.resendTextDisabled]}>
            {canResend ? '📧 Reenviar Código' : `Reenviar en ${formatTime(timeLeft)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  backButton: {
    position: 'absolute', top: 20, left: 20, zIndex: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  backText: { color: '#3BAFAA', fontSize: 16, fontWeight: '700' },
  header: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#E0F2F1', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  icon: { fontSize: 36 },
  title: { fontSize: 28, fontWeight: '900', color: '#1B4F72', marginBottom: 8 },
  subtitle: {
    fontSize: 15, color: '#64748B', textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 20,
  },
  errorBox: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  codeContainer: {
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    marginBottom: 20,
  },
  codeInput: {
    width: 48, height: 56, borderWidth: 2, borderColor: '#E2E8F0',
    borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '900',
    color: '#1B4F72', backgroundColor: '#FFFFFF',
  },
  codeInputFilled: { borderColor: '#3BAFAA', backgroundColor: '#F0FDF4' },
  codeInputError: { borderColor: '#EF4444' },
  timerContainer: { alignItems: 'center', marginBottom: 24 },
  timerText: { color: '#64748B', fontSize: 14 },
  timerBold: { fontWeight: '900', color: '#1B4F72' },
  timerExpired: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#3BAFAA', paddingVertical: 16, borderRadius: 16,
    alignItems: 'center', elevation: 4,
    shadowColor: '#3BAFAA', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: {
    color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1,
  },
  resendButton: { alignItems: 'center', marginTop: 20, paddingVertical: 12 },
  resendDisabled: { opacity: 0.4 },
  resendText: { color: '#3BAFAA', fontSize: 15, fontWeight: '700' },
  resendTextDisabled: { color: '#94A3B8' },
});
