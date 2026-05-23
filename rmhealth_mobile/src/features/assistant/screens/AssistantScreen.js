import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LocalWellnessEngine } from '../services/LocalWellnessEngine';
import { useWatchData } from '../../../hooks/useWatchData';
import { buildPreventiveSummary, formatSummaryForGemini } from '../../../services/PreventiveSummaryService';
import { Bot, Lock, Send, AlertTriangle } from 'lucide-react-native';

/**
 * AssistantScreen — RM Coach (Wellness Chat Assistant)
 * HIGH-END CONFIGURATION for Samsung S23 Ultra.
 * 
 * We use manual insets and avoid KeyboardAvoidingView entirely,
 * relying on Android's 'adjustPan' to slide the whole window.
 */
export const AssistantScreen = () => {
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const watchData = useWatchData() || {};
  const [preventiveCtx, setPreventiveCtx] = useState('');
  const [messages, setMessages] = useState([
    {
      id: '0',
      type: 'bot',
      text: language === 'en'
        ? 'Hi! I\'m **RM Coach**, your wellness assistant.\n\nYou can ask me about:\n• Your wellness metrics\n• Weekly summary\n• Wellness recommendations\n• How the app works\n\nTry writing "summary" or ask about blood pressure!'
        : '¡Hola! Soy **RM Coach**, tu asistente de bienestar.\n\nPuedes preguntarme sobre:\n• Tus métricas de salud\n• Resumen semanal\n• Recomendaciones de bienestar\n• Cómo funciona la app\n\n¡Escribe "resumen" o pregunta sobre presión arterial!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef();
  const isSendingRef = useRef(false);
  const hasBuiltCtxRef = useRef(false);

  // Build preventive context ONCE on mount (not on every poll cycle)
  useEffect(() => {
    if (hasBuiltCtxRef.current) return;
    hasBuiltCtxRef.current = true;
    (async () => {
      try {
        const summary = await buildPreventiveSummary(watchData);
        setPreventiveCtx(formatSummaryForGemini(summary));
      } catch (e) {
        console.warn('[AssistantScreen] PreventiveSummary error:', e);
      }
    })();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking || isSendingRef.current) return;
    isSendingRef.current = true;

    const userMsg = {
      id: Date.now().toString(),
      type: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setThinking(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // Inject preventive context if available
      const contextualText = preventiveCtx
        ? `[CONTEXTO PREVENTIVO]\n${preventiveCtx}\n[PREGUNTA DEL USUARIO]\n${text}`
        : text;
      const response = await LocalWellnessEngine.processMessage(contextualText, language);
      const botMsg = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        text: language === 'en'
          ? 'Something went wrong. Try again.'
          : 'Algo salió mal. Intenta de nuevo.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setThinking(false);
      isSendingRef.current = false;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  return (
    // We manually add bottom padding for the navigation bar using insets.bottom
    <View style={[s.safe, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerAvatar}>
          <Bot size={22} color="#1B7A6E" strokeWidth={2} />
        </View>
        <View>
          <Text style={s.headerTitle}>RM Coach</Text>
          <Text style={s.headerSub}>
            {language === 'en' ? 'Wellness Assistant' : 'Asistente de Bienestar'}
          </Text>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>
            {language === 'en' ? 'Private' : 'Privado'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(msg => (
            <View
              key={msg.id}
              style={[s.bubble, msg.type === 'user' ? s.bubbleUser : s.bubbleBot]}
            >
              <Text style={[s.bubbleText, msg.type === 'user' ? s.bubbleTextUser : s.bubbleTextBot]}>
                {msg.text}
              </Text>
              <Text style={[s.bubbleTime, msg.type === 'user' ? s.timeUser : s.timeBot]}>
                {msg.time}
              </Text>
            </View>
          ))}

          {thinking && (
            <View style={[s.bubble, s.bubbleBot]}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={s.thinkingText}>
                {language === 'en' ? 'Detecting patterns...' : 'Detectando patrones...'}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder={language === 'en' ? 'Ask me anything...' : 'Pregúntame lo que quieras...'}
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || thinking) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || thinking}
          >
            <Send size={18} color="#FFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: COLORS.surface, borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary + '15', justifyContent: 'center',
    alignItems: 'center', marginRight: 10,
  },
  avatarText: { fontSize: 22 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.secondary },
  headerSub: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  headerBadge: {
    marginLeft: 'auto', backgroundColor: COLORS.success + '15',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  headerBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.success },
  bubble: {
    maxWidth: '82%', padding: 12, borderRadius: 16, marginBottom: 8,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  bubbleBot: {
    backgroundColor: COLORS.surface, alignSelf: 'flex-start',
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary, alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextBot: { color: COLORS.text },
  bubbleTextUser: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 9, marginTop: 4, fontWeight: '600' },
  timeBot: { color: '#94A3B8' },
  timeUser: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  thinkingText: { fontSize: 12, color: '#94A3B8', marginTop: 6 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: COLORS.text, fontWeight: '500',
    marginRight: 10,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, justifyContent: 'center',
    alignItems: 'center', elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
  sendIcon: { fontSize: 18, color: '#FFF', fontWeight: '900' },
});
