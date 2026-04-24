import React, { useState, useEffect, Component } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Screens
import { HomeScreen } from './src/screens/HomeScreen';
import { MedicationScreen } from './src/features/medications/screens/MedicationScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { DeviceSettingsScreen } from './src/screens/DeviceSettingsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AboutScreen } from './src/screens/AboutScreen';

// Legal / Compliance Screens
import { PrivacyNoticeScreen, isPrivacyAccepted } from './src/screens/legal/PrivacyNoticeScreen';
import { TermsScreen, isTermsAccepted } from './src/screens/legal/TermsScreen';
import { InformedConsentScreen, isConsentGiven } from './src/screens/legal/InformedConsentScreen';

// Context
import { LanguageProvider } from './src/contexts/LanguageContext';
import { COLORS } from './src/theme';

const Stack = createStackNavigator();

// ============================================================
// ERROR BOUNDARY — Prevents full app crash on JS errors
// ============================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.icon}>⚠️</Text>
          <Text style={ebStyles.title}>Algo salió mal</Text>
          <Text style={ebStyles.subtitle}>Something went wrong</Text>
          <Text style={ebStyles.detail}>{this.state.error?.message || 'Error desconocido'}</Text>
          <TouchableOpacity
            style={ebStyles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={ebStyles.buttonText}>Reintentar / Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background, padding: 32,
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 16 },
  detail: { fontSize: 12, color: '#EF4444', textAlign: 'center', marginBottom: 24 },
  button: {
    backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, elevation: 3,
  },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});

// ============================================================
// LEGAL GATE — Blocks app until Privacy + Terms + Consent
// ============================================================
function LegalGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [privacyOk, setPrivacyOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [consentOk, setConsentOk] = useState(false);

  useEffect(() => {
    checkLegalStatus();
  }, []);

  const checkLegalStatus = async () => {
    const [p, t, c] = await Promise.all([
      isPrivacyAccepted(),
      isTermsAccepted(),
      isConsentGiven(),
    ]);
    setPrivacyOk(p);
    setTermsOk(t);
    setConsentOk(c);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!privacyOk) return <PrivacyNoticeScreen onAccept={() => setPrivacyOk(true)} />;
  if (!termsOk) return <TermsScreen onAccept={() => setTermsOk(true)} />;
  if (!consentOk) return <InformedConsentScreen onAccept={() => setConsentOk(true)} />;

  return children;
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <LegalGate>
          <NavigationContainer>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <Stack.Navigator
              initialRouteName="Home"
              screenOptions={{
                headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0 },
                headerTintColor: COLORS.text,
                headerTitleStyle: { fontWeight: 'bold', color: COLORS.secondary },
              }}
            >
              <Stack.Screen 
                name="Home" component={HomeScreen} 
                options={{ headerShown: false }} 
              />
              <Stack.Screen name="Medications" component={MedicationScreen} options={{ title: 'Medicamentos' }} />
              <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Historial' }} />
              <Stack.Screen name="DeviceSettings" component={DeviceSettingsScreen} options={{ title: 'Dispositivos' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
              <Stack.Screen name="About" component={AboutScreen} options={{ title: 'RmHealth' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </LegalGate>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
