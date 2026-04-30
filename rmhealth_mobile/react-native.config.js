/**
 * react-native.config.js
 * Deshabilita el autolinking nativo de react-native-health-connect.
 * El módulo nativo NO se carga al iniciar la app.
 * REACTIVAR cuando Health Connect esté estabilizado:
 *   → comentar el bloque 'react-native-health-connect'
 */
module.exports = {
  dependencies: {
    'react-native-health-connect': {
      platforms: {
        android: null, // deshabilitado — evita crash nativo al iniciar
        ios: null,
      },
    },
  },
};
