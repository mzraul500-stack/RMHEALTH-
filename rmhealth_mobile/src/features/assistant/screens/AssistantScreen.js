import React, { useState, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { COLORS } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LocalWellnessEngine } from '../services/LocalWellnessEngine';

/**
 * AssistantScreen — RM Coach (Wellness Chat Assistant)
 * Phase 1: 100% local, no internet required.
 * Premium chat UI inspired by modern health apps.
 */
export const AssistantScreen = () => {
  const { language } = useLanguage();
  const [messages, setMessages] = useState([
    {
      id: '0',
      type: 'bot',
      text: language === 'en'
        ? '👋 Hi! I\'m **RM Coach**, your wellness assistant.\n\nYou can ask me about:\n• Your health metrics\n• Weekly summary\n• Medications\n• How the app works\n\nTry writing "summary" or ask about blood pressure!'
        : '👋 ¡Hola! Soy **RM Coach**, tu asistente de bienestar.\n\nPuedes preguntarme sobre:\n• Tus métricas de salud\n• Resumen semanal\n• Medicamentos\n• Cómo funciona la app\n\n¡Escribe "resumen" o pregunta sobre presión arterial!',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef();

  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg = {
      id: Date.now().toString(),
      type: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    // Scroll to bottom
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await LocalWellnessEngine.processMessage(text, language);
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
          ? '⚠️ Something went wrong. Try again.'
          : '⚠️ Algo salió mal. Intenta de nuevo.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setThinking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  const quickActions = language === 'en'
    ? [
        { label: '📊 Summary', text: 'summary' },
        { label: '💊 Meds', text: 'medication log' },
        { label: '❤️ Heart Rate', text: 'heart rate' },
        { label: '🩸 Blood Pressure', text: 'blood pressure' },
      ]
    : [
        { label: '📊 Resumen', text: 'resumen' },
        { label: '💊 Medicinas', text: 'tome mi medicina' },
        { label: '❤️ Pulso', text: 'pulso' },
        { label: '🩸 Presión', text: 'presión arterial' },
      ];

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerAvatar}>
          <Text style={s.avatarText}>🤖</Text>
        </View>
        <View>
          <Text style={s.headerTitle}>RM Coach</Text>
          <Text style={s.headerSub}>
            {language === 'en' ? 'Wellness Assistant • Local' : 'Asistente de Bienestar • Local'}
          </Text>
        </View>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>
            {language === 'en' ? '🔒 Private' : '🔒 Privado'}
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={s.quickRow}>
        {quickActions.map((qa, i) => (
          <TouchableOpacity
            key={i}
            style={s.quickBtn}
            onPress={() => {
              setInput(qa.text);
              setTimeout(() => handleSend(), 100);
            }}
          >
            <Text style={s.quickText}>{qa.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 100}>
        <ScrollView
          ref={scrollRef}
          style={s.chatArea}
          contentContainerStyle={s.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
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
                {language === 'en' ? 'Analyzing...' : 'Analizando...'}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
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
            <Text style={s.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================
// STYLES — Premium Chat UI
// ============================================================
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary + '15', justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 24 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.secondary },
  headerSub: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  headerBadge: {
    marginLeft: 'auto', backgroundColor: COLORS.success + '15',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  headerBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.success },

  // Quick Actions
  quickRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    gap: 6, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  quickBtn: {
    flex: 1, backgroundColor: COLORS.primary + '10',
    paddingVertical: 8, borderRadius: 20, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.primary + '25',
  },
  quickText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Chat
  chatArea: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 8 },

  bubble: {
    maxWidth: '82%', padding: 14, borderRadius: 18, marginBottom: 10,
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
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTextBot: { color: COLORS.text },
  bubbleTextUser: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 9, marginTop: 6, fontWeight: '600' },
  timeBot: { color: '#94A3B8' },
  timeUser: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  thinkingText: { fontSize: 12, color: '#94A3B8', marginTop: 6 },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, paddingBottom: 14,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, backgroundColor: '#F1F5F9', borderRadius: 24,
    paddingHorizontal: 18, paddingVertical: 12,
    fontSize: 15, color: COLORS.text, fontWeight: '500',
    marginRight: 8,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, justifyContent: 'center',
    alignItems: 'center', elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
  sendIcon: { fontSize: 18, color: '#FFF', fontWeight: '900' },
});
