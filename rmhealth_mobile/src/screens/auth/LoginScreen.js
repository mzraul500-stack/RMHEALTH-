/**
 * LoginScreen — RMHealth Authentication (M1)
 *
 * Email + Password login with validation.
 * Links to Register and Forgot Password.
 * Premium RMHealth branding.
 *
 * © 2025 MORALES ZEPEDA RAUL
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export function LoginScreen({ onNavigateRegister, onNavigateForgot, onLogin2FA }) {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');

    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña');
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('El correo ingresado no tiene formato válido');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result.status === '2fa_required') {
        onLogin2FA(result.user_id);
      }
    } catch (e) {
      setError(e.message || 'Error de autenticación');
    } finally {
      setIsLoading(false);
    }
  };

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
          <Text style={styles.appName}>RMHealth</Text>
          <Text style={styles.subtitle}>Monitoreo de Salud Personal</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar Sesión</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

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
              placeholder="••••••••"
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
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity onPress={onNavigateForgot} style={styles.forgotLink}>
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={isLoading}
            accessibilityLabel="Botón de iniciar sesión"
            accessibilityRole="button"
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>INICIAR SESIÓN</Text>
            )}
          </TouchableOpacity>

          {/* Register Link */}
          <View style={styles.registerRow}>
            <Text style={styles.registerLabel}>¿No tienes cuenta? </Text>
            <TouchableOpacity onPress={onNavigateRegister}>
              <Text style={styles.registerLink}>Crear Cuenta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer disclaimer */}
        <Text style={styles.disclaimer}>
          RmHealth es una herramienta de monitoreo personal.{'\n'}
          No constituye un dispositivo médico.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 56, marginBottom: 8 },
  appName: {
    fontSize: 32, fontWeight: '900', color: '#1B4F72',
    letterSpacing: -1,
  },
  subtitle: { fontSize: 14, color: '#64748B', fontWeight: '600', marginTop: 4 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28,
    shadowColor: '#1B4F72', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 8,
  },
  cardTitle: {
    fontSize: 22, fontWeight: '900', color: '#1E293B',
    marginBottom: 24, textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  label: {
    fontSize: 13, fontWeight: '800', color: '#475569',
    marginBottom: 6, marginTop: 12, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#1E293B', fontWeight: '500',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: {
    position: 'absolute', right: 14, top: 12,
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
  },
  eyeIcon: { fontSize: 20 },
  forgotLink: { alignSelf: 'flex-end', marginTop: 8, marginBottom: 20 },
  forgotText: { color: '#3BAFAA', fontSize: 13, fontWeight: '700' },
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
  registerRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 20,
  },
  registerLabel: { color: '#64748B', fontSize: 14 },
  registerLink: { color: '#3BAFAA', fontSize: 14, fontWeight: '800' },
  disclaimer: {
    color: '#94A3B8', fontSize: 11, textAlign: 'center',
    marginTop: 24, lineHeight: 16,
  },
});
