import React, { useState, useEffect, Component } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, ActivityIndicator, View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Platform, Alert, PermissionsAndroid } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import { HomeScreen } from './src/screens/HomeScreen';
import { MedicationScreen } from './src/features/medications/screens/MedicationScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { DeviceSettingsScreen } from './src/screens/DeviceSettingsScreen';
import { ProfileScreen } from './src/screens/profile/ProfileScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { AssistantScreen } from './src/features/assistant/screens/AssistantScreen';
import { PreventiveAlertsScreen } from './src/screens/PreventiveAlertsScreen';

// Auth Screens (M1)
import { LoginScreen } from './src/screens/auth/LoginScreen';
import { RegisterScreen } from './src/screens/auth/RegisterScreen';
import { TwoFactorScreen } from './src/screens/auth/TwoFactorScreen';

// Legal / Compliance Screens
import { PrivacyNoticeScreen, isPrivacyAccepted } from './src/screens/legal/PrivacyNoticeScreen';
import { TermsScreen, isTermsAccepted } from './src/screens/legal/TermsScreen';
import { InformedConsentScreen, isConsentGiven } from './src/screens/legal/InformedConsentScreen';

// Consent (M2)
import { ConsentOnboardingScreen } from './src/screens/consent/ConsentOnboardingScreen';
import { PrivacySettingsScreen } from './src/screens/settings/PrivacySettingsScreen';
import MyDoctorsScreen from './src/screens/settings/MyDoctorsScreen';

// Medical Profile (M3)
import { EmergencyCardScreen } from './src/screens/profile/EmergencyCardScreen';

// Clinical Record (M9)
import { MiExpedienteScreen } from './src/screens/MiExpedienteScreen';

// Context
import { LanguageProvider, useLanguage } from './src/contexts/LanguageContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { COLORS } from './src/theme';
import { User, ShieldAlert, Watch, Lock, Stethoscope, CreditCard, Info, LogOut, FileText, Home as HomeIcon, Bot, CalendarDays, Pill, Settings } from 'lucide-react-native';
import { LocationService } from './src/services/LocationService';
import * as Notifications from 'expo-notifications';
import { FEATURES } from './src/config/features';
// requestWatchPermissions solo se importa si Health Connect está habilitado
const requestWatchPermissions = FEATURES.HEALTH_CONNECT_ENABLED
  ? require('./src/services/HealthConnectService').requestWatchPermissions
  : async () => false;

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ============================================================
// CUSTOM TAB BAR ICONS (Unicode-based, no external lib needed)
// ============================================================
const TAB_ICONS = {
  Home:     { IconComp: HomeIcon,     label_es: 'Inicio',       label_en: 'Home' },
  Coach:    { IconComp: Bot,          label_es: 'Coach',        label_en: 'Coach' },
  History:  { IconComp: CalendarDays, label_es: 'Historial',    label_en: 'History' },
  Meds:     { IconComp: Pill,         label_es: 'Medicinas',    label_en: 'Meds' },
  More:     { IconComp: Settings,     label_es: 'Más',          label_en: 'More' },
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
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="MiExpediente" component={MiExpedienteScreen} options={{ title: 'Mi Expediente' }} />
      <Stack.Screen name="PreventiveAlerts" component={PreventiveAlertsScreen} options={{ title: 'Alertas Preventivas', headerShown: false }} />
      <Stack.Screen name="DeviceSettings" component={DeviceSettingsScreen} options={{ title: 'Dispositivos' }} />
      <Stack.Screen name="PrivacySettings" component={PrivacySettingsScreen} options={{ title: 'Privacidad' }} />
      <Stack.Screen name="MyDoctors" component={MyDoctorsScreen} options={{ title: 'Mis Médicos' }} />
      <Stack.Screen name="EmergencyCard" component={EmergencyCardScreen} options={{ title: 'Tarjeta de Emergencia' }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: 'RmHealth' }} />
    </Stack.Navigator>
  );
}

// Simple More Menu
function MoreMenuScreen({ navigation }) {
  const { logout, user } = useAuth();

  const menuItems = [
    { IconComp: User, label: 'Mi Perfil', screen: 'Profile' },
    { IconComp: FileText, label: 'Mi Expediente', screen: 'MiExpediente' },
    { IconComp: ShieldAlert, label: 'Alertas Preventivas', screen: 'PreventiveAlerts' },
    { IconComp: Watch, label: 'Dispositivos / Relojes', screen: 'DeviceSettings' },
    { IconComp: Lock, label: 'Privacidad y Datos', screen: 'PrivacySettings' },
    { IconComp: Stethoscope, label: 'Mis Médicos', screen: 'MyDoctors' },
    { IconComp: CreditCard, label: 'Tarjeta de Emergencia', screen: 'EmergencyCard' },
    { IconComp: Info, label: 'Acerca de RmHealth', screen: 'About' },
  ];

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Sesión', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* User info */}
      {user && (
        <View style={{
          backgroundColor: COLORS.surface, padding: 16, borderRadius: 14,
          marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: '#E0F2F1',
            justifyContent: 'center', alignItems: 'center', marginRight: 12,
          }}>
            <User size={24} color="#1B7A6E" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{user.full_name}</Text>
            <Text style={{ fontSize: 13, color: '#64748B' }}>{user.email}</Text>
          </View>
        </View>
      )}

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
          <item.IconComp size={22} color="#1B7A6E" strokeWidth={2} style={{ marginRight: 14 }} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 }}>{item.label}</Text>
          <Text style={{ fontSize: 18, color: '#94A3B8' }}>›</Text>
        </TouchableOpacity>
      ))}

      {/* Logout Button */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#FEF2F2', padding: 16, borderRadius: 14,
          marginTop: 20, borderWidth: 1, borderColor: '#FECACA',
        }}
        onPress={handleLogout}
        accessibilityLabel="Cerrar sesión"
        accessibilityRole="button"
      >
        <LogOut size={20} color="#DC2626" strokeWidth={2} style={{ marginRight: 10 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#DC2626' }}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
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
    async function prepare() {
      try {
        // 1. Check legal gates
        const privacy = await isPrivacyAccepted();
        const terms = await isTermsAccepted();
        const consent = await isConsentGiven();

        setPrivacyOk(privacy);
        setTermsOk(terms);
        setConsentOk(consent);

        if (privacy && terms && consent) {
          // Start background tracking if all legal gates are passed
          LocationService.startBackgroundTracking();
        }

        // Permisos gestionados por PermissionGate al iniciar la app

      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    }
    prepare();
  }, []);

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
// PERMISSION GATE — Solicita permisos en background (no-bloqueante)
// La app NUNCA se cierra por este gate — children siempre renderizan.
// Flujo background: Notificaciones → Ubicación → Health Connect
// ============================================================
function PermissionGate({ children }) {
  useEffect(() => {
    const requestPerms = async () => {
      try {
        // 1. Notificaciones — solo Android 13+ (API 33+) tiene POST_NOTIFICATIONS
        if (Platform.OS === 'android') {
          const postNotiPerm = PermissionsAndroid?.PERMISSIONS?.POST_NOTIFICATIONS;
          if (postNotiPerm) {
            const result = await PermissionsAndroid.request(
              postNotiPerm,
              {
                title: 'RMHealth necesita notificaciones',
                message:
                  'Las notificaciones son necesarias para alertarte en caso de emergencia médica.',
                buttonPositive: 'Permitir',
                buttonNegative: 'Ahora no',
              }
            );
            if (result !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert(
                'Notificaciones desactivadas',
                'Las notificaciones son necesarias para alertarte en caso de emergencia médica.\n\n'
                + 'Puedes activarlas en Configuración → Aplicaciones → RMHealth.',
                [{ text: 'Entendido' }]
              );
            }
          }
        } else {
          await Notifications.requestPermissionsAsync().catch(() => {});
        }

        // 2. Ubicación — para ruteo de emergencias
        await LocationService.requestPermissions().catch(() => {});

        // 3. Health Connect — Galaxy Watch 8 (FC, SpO2, Temp, BP)
        //    Solo se solicita si FEATURES.HEALTH_CONNECT_ENABLED = true
        if (FEATURES.HEALTH_CONNECT_ENABLED) {
          await requestWatchPermissions().catch(() => {});
        }

      } catch (e) {
        // Silencioso — ningún error de permisos debe cerrar la app
        console.warn('[PermissionGate]', e);
      }
    };

    // Delay de 1.5s para no bloquear el render inicial
    const timer = setTimeout(requestPerms, 1500);
    return () => clearTimeout(timer);
  }, []);

  // children SIEMPRE renderizan — la app nunca se cierra por permisos
  return children;
}


// ============================================================
// CONSENT GATE — Granular data consent (M2)
// ============================================================
function ConsentGate({ children }) {
  const { accessToken, user } = useAuth();
  const [consentsDone, setConsentsDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConsents = async () => {
      if (!accessToken || !user?.id) {
        setConsentsDone(false);
        setLoading(false);
        return;
      }

      try {
        // Check if user already has consents saved
        const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
          || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

        const res = await fetch(`${API_BASE}/users/${user.id}/consents`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          const hasVitalSignsConsent = data.consents?.vital_signs?.accepted === true;
          setConsentsDone(hasVitalSignsConsent);
        } else {
          // If 404 or error, show consent screen
          setConsentsDone(false);
        }
      } catch (e) {
        console.warn('[ConsentGate] Check failed:', e);
        setConsentsDone(false);
      } finally {
        setLoading(false);
      }
    };

    checkConsents();
  }, [accessToken, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!consentsDone) {
    return <ConsentOnboardingScreen onComplete={() => setConsentsDone(true)} />;
  }

  return children;
}


// ============================================================
// AUTH GATE — Blocks app until user is authenticated (M1)
// ============================================================
function AuthGate({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'register' | '2fa'
  const [previousAuthScreen, setPreviousAuthScreen] = useState('login');
  const [pending2FAUserId, setPending2FAUserId] = useState(null);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen
          onNavigateLogin={() => setAuthScreen('login')}
          onRegister2FA={(userId) => {
            setPending2FAUserId(userId);
            setPreviousAuthScreen('register');
            setAuthScreen('2fa');
          }}
        />
      );
    }

    if (authScreen === '2fa' && pending2FAUserId) {
      return (
        <TwoFactorScreen
          userId={pending2FAUserId}
          onSuccess={() => {
            // Auth context will update isAuthenticated automatically
          }}
          onBack={() => {
            setPending2FAUserId(null);
            setAuthScreen(previousAuthScreen);
          }}
        />
      );
    }

    return (
      <LoginScreen
        onNavigateRegister={() => setAuthScreen('register')}
        onNavigateForgot={() => {
          // For now, show alert. Full forgot-password flow in next iteration.
          import('react-native').then(({ Alert }) => {
            Alert.alert(
              'Recuperar Contraseña',
              'Enviaremos un código de recuperación a tu correo registrado.',
              [{ text: 'OK' }]
            );
          });
        }}
        onLogin2FA={(userId) => {
          setPending2FAUserId(userId);
          setPreviousAuthScreen('login');
          setAuthScreen('2fa');
        }}
      />
    );
  }

  return children;
}


import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';

function MainNavigator() {
  const { tr } = useLanguage();
  const { isHighContrast, colors } = useTheme();

  return (
    <NavigationContainer>
      <StatusBar barStyle={isHighContrast ? "light-content" : "dark-content"} backgroundColor={colors.background} translucent={false} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => {
            const icon = TAB_ICONS[route.name];
            const color = focused ? colors.primary : colors.navInactive;
            return (
              <View style={focused ? tabStyles.iconContainerActive : tabStyles.iconContainer}>
                <icon.IconComp size={22} color={color} strokeWidth={focused ? 2.5 : 2} />
              </View>
            );
          },
          tabBarLabel: ({ focused }) => {
            const icon = TAB_ICONS[route.name];
            const labelKey = `nav_${route.name.toLowerCase()}`;
            return (
              <Text style={[tabStyles.label, focused && tabStyles.labelActive, { color: focused ? colors.primary : colors.navInactive }]}>
                {tr(labelKey)}
              </Text>
            );
          },
          tabBarButton: (props) => {
            const labelKey = `nav_${route.name.toLowerCase()}`;
            return (
              <TouchableOpacity
                {...props}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={tr(labelKey)}
                activeOpacity={0.8}
              />
            );
          },
          tabBarStyle: [
            tabStyles.bar, 
            { display: route.name === 'Coach' ? 'none' : 'flex', backgroundColor: colors.surface, borderTopColor: colors.border },
            isHighContrast && { borderTopWidth: 2 }
          ],
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.navInactive,
          tabBarVisibilityAnimationConfig: {
            show: { animation: 'timing', config: { duration: 0 } },
            hide: { animation: 'timing', config: { duration: 0 } }
          }
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Coach" component={AssistantScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Meds" component={MedicationScreen} />
        <Tab.Screen name="More" component={MoreStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <AuthGate>
                <LegalGate>
                  <PermissionGate>
                    <ConsentGate>
                      <MainNavigator />
                    </ConsentGate>
                  </PermissionGate>
                </LegalGate>
              </AuthGate>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
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
    fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 2,
  },
  labelActive: {
    color: '#1B7A6E', fontWeight: '900',
  },
});
