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
  ActivityIndicator, SafeAreaView, Alert, Platform,
  KeyboardAvoidingView, ScrollView, BackHandler
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

const CODE_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60; // 60 seconds for resend

export function TwoFactorScreen({ userId, onSuccess, onBack }) {
  const { verify2FA, resend2FA } = useAuth();

  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(RESEND_DELAY_SECONDS);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef([]);

  // Hardware back button support
  useEffect(() => {
    const backAction = () => {
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [onBack]);

  // Countdown timer
  useEffect(() => {
    if (resendTimer <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setResendTimer(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendTimer]);

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

  const handleResend = async () => {
    try {
      setIsLoading(true);
      setError('');
      await resend2FA(userId);
      // Reset timer and disable resend
      setResendTimer(RESEND_DELAY_SECONDS);
      setCanResend(false);
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert('Código Enviado', 'Hemos enviado un nuevo código de verificación a tu correo electrónico.');
    } catch (e) {
      setError(e.message || 'Error al reenviar el código');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              accessibilityLabel="Regresar"
            >
              <Text style={styles.backText}>← Regresar</Text>
            </TouchableOpacity>
          </View>

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

          {/* Timer Info */}
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>
              El código es válido por <Text style={styles.timerBold}>10 minutos</Text>
            </Text>
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

          <TouchableOpacity
            style={[styles.resendButton, (!canResend || isLoading) && styles.resendDisabled]}
            onPress={handleResend}
            disabled={!canResend || isLoading}
            accessibilityLabel="Reenviar código de verificación"
          >
            <Text style={[styles.resendText, (!canResend || isLoading) && styles.resendTextDisabled]}>
              {canResend ? '📧 Reenviar Código' : `Reenviar en ${formatTime(resendTimer)}`}
            </Text>
          </TouchableOpacity>

          {/* Emergencia: Botón para Cancelar / Cambiar Correo que nunca se bloquea */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onBack}
            accessibilityLabel="Cambiar correo o cancelar"
          >
            <Text style={styles.cancelText}>❌ Cambiar correo / Cancelar</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { 
    flexGrow: 1, 
    padding: 24, 
    paddingTop: Platform.OS === 'android' ? 40 : 24, 
    justifyContent: 'flex-start' 
  },
  topBar: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 40,
    marginTop: 10,
  },
  backButton: {
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: '#E0F2F1', borderRadius: 8,
  },
  backText: { color: '#1B7A6E', fontSize: 16, fontWeight: '800' },
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
  resendDisabled: {
    backgroundColor: '#F3F4F6',
  },
  resendText: { color: '#0D9488', fontSize: 15, fontWeight: '700' },
  resendTextDisabled: {
    color: '#9CA3AF',
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
});
