import React, { useState, useEffect, Component } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

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

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ============================================================
// CUSTOM TAB BAR ICONS (Unicode-based, no external lib needed)
// ============================================================
const TAB_ICONS = {
  Home:     { active: '🏠', inactive: '🏡', label_es: 'Inicio',       label_en: 'Home' },
  History:  { active: '📅', inactive: '📆', label_es: 'Historial',    label_en: 'History' },
  Meds:     { active: '💊', inactive: '💉', label_es: 'Medicinas',    label_en: 'Meds' },
  Profile:  { active: '👤', inactive: '👥', label_es: 'Perfil',       label_en: 'Profile' },
  More:     { active: '⚙️', inactive: '⚙️', label_es: 'Más',          label_en: 'More' },
};

// ============================================================
// MORE STACK — Settings, About, Device Settings
// ============================================================
function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background, elevation: 0, shadowOpacity: 0 },
        headerTintColor: COLORS.secondary,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'Configuración' }} />
      <Stack.Screen name="DeviceSettings" component={DeviceSettingsScreen} options={{ title: 'Dispositivos' }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: 'RmHealth' }} />
    </Stack.Navigator>
  );
}

// Simple More Menu
function MoreMenuScreen({ navigation }) {
  const menuItems = [
    { icon: '⌚', label: 'Dispositivos / Relojes', screen: 'DeviceSettings' },
    { icon: 'ℹ️', label: 'Acerca de RmHealth', screen: 'About' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, padding: 16 }}>
      {menuItems.map((item, i) => (
        <TouchableOpacity
          key={i}
          style={{
            flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
            padding: 18, borderRadius: 14, marginBottom: 10,
            borderWidth: 1, borderColor: COLORS.border, elevation: 2,
          }}
          onPress={() => navigation.navigate(item.screen)}
        >
          <Text style={{ fontSize: 24, marginRight: 14 }}>{item.icon}</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 }}>{item.label}</Text>
          <Text style={{ fontSize: 18, color: '#94A3B8' }}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

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
// APP ROOT — Premium Bottom Tab Navigation
// ============================================================
export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <LegalGate>
          <NavigationContainer>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} translucent={false} />
            <Tab.Navigator
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarIcon: ({ focused }) => {
                  const icon = TAB_ICONS[route.name];
                  return (
                    <View style={focused ? tabStyles.iconContainerActive : tabStyles.iconContainer}>
                      <Text style={tabStyles.iconText}>{focused ? icon.active : icon.inactive}</Text>
                    </View>
                  );
                },
                tabBarLabel: ({ focused }) => {
                  const icon = TAB_ICONS[route.name];
                  return (
                    <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                      {icon.label_es}
                    </Text>
                  );
                },
                tabBarStyle: tabStyles.bar,
                tabBarHideOnKeyboard: true,
              })}
            >
              <Tab.Screen name="Home" component={HomeScreen} />
              <Tab.Screen name="History" component={HistoryScreen} />
              <Tab.Screen name="Meds" component={MedicationScreen} />
              <Tab.Screen name="Profile" component={ProfileScreen} />
              <Tab.Screen name="More" component={MoreStack} />
            </Tab.Navigator>
          </NavigationContainer>
        </LegalGate>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

// ============================================================
// TAB BAR STYLES — Samsung Health inspired
// ============================================================
const tabStyles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: '#1B4F72',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    height: Platform.OS === 'ios' ? 88 : 90,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 24,
  },
  iconContainer: {
    width: 40, height: 32, justifyContent: 'center', alignItems: 'center',
  },
  iconContainerActive: {
    width: 40, height: 32, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.primary + '18',
    borderRadius: 16,
  },
  iconText: {
    fontSize: 22,
  },
  label: {
    fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2,
  },
  labelActive: {
    color: COLORS.primary, fontWeight: '800',
  },
});
