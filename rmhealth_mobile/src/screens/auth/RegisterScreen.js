/**
 * RegisterScreen — RMHealth Account Creation (M1)
 *
 * Full name, email, password with strength validation.
 * After successful registration, navigates to 2FA screen.
 *
 * © 2025 MORALES ZEPEDA RAUL
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export function RegisterScreen({ onNavigateLogin, onRegister2FA }) {
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Password strength indicators
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleRegister = async () => {
    setError('');

    if (!fullName.trim()) {
      setError('Ingresa tu nombre completo');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('El correo ingresado no tiene formato válido');
      return;
    }

    if (!hasMinLength || !hasUppercase || !hasNumber) {
      setError('La contraseña no cumple con los requisitos');
      return;
    }

    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register(email.trim(), password, confirmPassword, fullName.trim());
      if (result.requires_2fa) {
        onRegister2FA(result.user_id);
      }
    } catch (e) {
      setError(e.message || 'Error al crear la cuenta');
    } finally {
      setIsLoading(false);
    }
  };

  const StrengthIndicator = ({ met, label }) => (
    <View style={styles.strengthRow}>
      <Text style={[styles.strengthIcon, met && styles.strengthMet]}>
        {met ? '✅' : '⬜'}
      </Text>
      <Text style={[styles.strengthLabel, met && styles.strengthLabelMet]}>
        {label}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🏥</Text>
          <Text style={styles.appName}>Crear Cuenta</Text>
          <Text style={styles.subtitle}>Únete a RMHealth</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          {/* Full Name */}
          <Text style={styles.label}>Nombre Completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: María González López"
            placeholderTextColor="#94A3B8"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            accessibilityLabel="Campo de nombre completo"
          />

          {/* Email */}
          <Text style={styles.label}>Correo Electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="tu@correo.com"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Campo de correo electrónico"
          />

          {/* Password */}
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              accessibilityLabel="Campo de contraseña"
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Password Strength */}
          <View style={styles.strengthBox}>
            <StrengthIndicator met={hasMinLength} label="Mínimo 8 caracteres" />
            <StrengthIndicator met={hasUppercase} label="Al menos 1 mayúscula" />
            <StrengthIndicator met={hasNumber} label="Al menos 1 número" />
          </View>

          {/* Confirm Password */}
          <Text style={styles.label}>Confirmar Contraseña</Text>
          <TextInput
            style={[styles.input, passwordsMatch && styles.inputValid]}
            placeholder="Repite tu contraseña"
            placeholderTextColor="#94A3B8"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            accessibilityLabel="Campo de confirmación de contraseña"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <Text style={styles.mismatchText}>Las contraseñas no coinciden</Text>
          )}

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={isLoading}
            accessibilityLabel="Botón de crear cuenta"
            accessibilityRole="button"
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>CREAR CUENTA</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginLabel}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={onNavigateLogin}>
              <Text style={styles.loginLink}>Iniciar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { fontSize: 48, marginBottom: 4 },
  appName: { fontSize: 28, fontWeight: '900', color: '#1B4F72' },
  subtitle: { fontSize: 14, color: '#64748B', fontWeight: '600', marginTop: 4 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#1B4F72', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  label: {
    fontSize: 12, fontWeight: '800', color: '#475569',
    marginBottom: 6, marginTop: 12, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#1E293B', fontWeight: '500',
  },
  inputValid: { borderColor: '#10B981' },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: {
    position: 'absolute', right: 14, top: 12,
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
  },
  eyeIcon: { fontSize: 20 },
  strengthBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 8,
  },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  strengthIcon: { fontSize: 14, marginRight: 8 },
  strengthMet: {},
  strengthLabel: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  strengthLabelMet: { color: '#10B981' },
  mismatchText: { color: '#EF4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  primaryButton: {
    backgroundColor: '#3BAFAA', paddingVertical: 16, borderRadius: 16,
    alignItems: 'center', marginTop: 24, elevation: 4,
    shadowColor: '#3BAFAA', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: {
    color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1,
  },
  loginRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 16,
  },
  loginLabel: { color: '#64748B', fontSize: 14 },
  loginLink: { color: '#3BAFAA', fontSize: 14, fontWeight: '800' },
});
