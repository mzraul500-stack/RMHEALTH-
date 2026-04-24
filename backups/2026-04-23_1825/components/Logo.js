import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export const Logo = ({ size = 1 }) => {
  return (
    <View style={[styles.container, { transform: [{ scale: size }] }]}>
      <Text style={styles.rmText}>RM</Text>
      <View style={styles.line} />
      <Text style={styles.healthText}>HEALTH</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  rmText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#3BAFAA', // El tono exacto de tu logo
    lineHeight: 45,
    letterSpacing: -1,
  },
  line: {
    width: 70,
    height: 4,
    backgroundColor: '#3BAFAA',
    marginVertical: 2,
  },
  healthText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3BAFAA',
    letterSpacing: 4,
  },
});
