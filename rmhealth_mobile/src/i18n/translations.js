/**
 * RMHealth — Complete Translation System (ES/EN)
 * 
 * ALL user-facing strings for the regulatory compliance layer.
 * No hardcoded strings anywhere else in the app.
 * 
 * Regulatory references:
 * - COFEPRIS: NOM-024-SSA3-2012, LFPDPPP
 * - FDA: General Wellness Policy (January 2026)
 * - HIPAA: §164.312
 */

export const LANGUAGES = { ES: 'es', EN: 'en' };

export const t = {
  es: {
    // === COMMON ===
    app_name: 'RmHealth',
    accept: 'Acepto',
    decline: 'Rechazar',
    continue: 'Continuar',
    save: 'Guardar',
    cancel: 'Cancelar',
    close: 'Cerrar',
    back: 'Regresar',
    language_label: 'ES 🇲🇽',
    language_switch: 'EN 🇺🇸',

    // === CLINICAL DISCLAIMER (persistent banner) ===
    disclaimer_banner: 'RmHealth es una herramienta de monitoreo personal. No constituye un dispositivo médico, no realiza diagnósticos y no sustituye la consulta médica profesional.',
    disclaimer_checkbox: 'Entiendo que estos datos son informativos y no constituyen un diagnóstico médico.',
    disclaimer_title: 'Aviso Importante',

    // === FDA / COFEPRIS UNIVERSAL LINE ===
    fda_line: 'Esta aplicación no está destinada a diagnosticar, tratar, curar ni prevenir ninguna enfermedad.',
    fda_reference: 'Política de Bienestar General FDA / COFEPRIS Clase I',

    // === PRIVACY NOTICE ===
    privacy_title: 'Aviso de Privacidad',
    privacy_controller: 'Responsable',
    privacy_controller_value: 'Raúl Morales Zepeda / RmHealth — Acapulco, Guerrero, México',
    privacy_data_collected: 'Datos recabados',
    privacy_data_collected_value: 'Nombre, edad, signos vitales ingresados manualmente por el usuario.',
    privacy_purpose: 'Finalidad',
    privacy_purpose_value: 'Monitoreo personal de salud — sin diagnóstico clínico. La información generada es estrictamente informativa y no sustituye la evaluación de un profesional de la salud.',
    privacy_rights: 'Derechos ARCO',
    privacy_rights_value: 'Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales. Para ejercer estos derechos, contacte a: contacto@rmhealth.ai',
    privacy_transfers: 'Transferencias',
    privacy_transfers_value: 'Sus datos no son compartidos con terceros. Todo el procesamiento ocurre en la infraestructura segura de RmHealth (Google Cloud Platform).',
    privacy_accept: 'Acepto el Aviso de Privacidad',
    privacy_decline: 'Rechazar',
    privacy_decline_message: 'Es necesario aceptar el Aviso de Privacidad para utilizar RmHealth. La aplicación se cerrará.',
    privacy_law_reference: 'Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.',

    // === TERMS AND CONDITIONS ===
    terms_title: 'Términos y Condiciones',
    terms_version: 'Versión',
    terms_date: 'Fecha',
    terms_jurisdiction: 'Jurisdicción: México',
    terms_body: `RmHealth es una aplicación de monitoreo personal de salud de carácter estrictamente informativo. La información, datos y lecturas generadas a través de esta aplicación no constituyen un diagnóstico médico, prescripción, tratamiento ni consejo clínico de ningún tipo, y no deben interpretarse como sustituto de la atención, evaluación o recomendación de un profesional de la salud debidamente certificado.

El usuario reconoce que los datos de signos vitales registrados en la aplicación pueden estar sujetos a márgenes de error, imprecisiones o variaciones derivadas de, entre otros factores: (i) las características y limitaciones del dispositivo de medición utilizado; (ii) condiciones fisiológicas o ambientales al momento del registro; (iii) error en el ingreso manual de datos por parte del usuario; (iv) fallas técnicas, interrupciones de conectividad o causas de fuerza mayor atribuibles a terceros, incluyendo proveedores de red, fabricantes de hardware o plataformas de sistema operativo.

RmHealth, su desarrollador y sus colaboradores no asumen responsabilidad alguna por decisiones de carácter médico, clínico o de emergencia que el usuario o terceros tomen con base en la información desplegada por esta aplicación. Ante cualquier síntoma, malestar o situación de riesgo para la salud, el usuario deberá consultar de inmediato a un profesional médico o acudir al centro hospitalario más cercano.

El uso de esta aplicación implica la aceptación plena de los presentes términos.`,
    terms_accept: 'Acepto los Términos y Condiciones',

    // === INFORMED CONSENT ===
    consent_title: 'Consentimiento Informado',
    consent_intro: 'Antes de registrar signos vitales, lea y acepte lo siguiente:',
    consent_data_what: '¿Qué datos se registran?',
    consent_data_what_value: 'Frecuencia cardíaca, saturación de oxígeno, presión arterial, glucosa, temperatura — ingresados manualmente por usted.',
    consent_data_why: '¿Para qué se usan?',
    consent_data_why_value: 'Para generar un registro personal de tendencias de salud. Estos datos NO son analizados por un profesional médico dentro de la aplicación.',
    consent_self_reported: 'Datos auto-reportados',
    consent_self_reported_value: 'Los datos son ingresados manualmente por el usuario. RmHealth no verifica la exactitud de los valores introducidos.',
    consent_not_medical: 'No sustituye atención médica',
    consent_not_medical_value: 'Esta aplicación NO sustituye la consulta, diagnóstico ni tratamiento de un profesional de la salud.',
    consent_signature_label: 'Nombre completo (firma digital)',
    consent_signature_placeholder: 'Escriba su nombre completo',
    consent_checkbox: 'He leído y acepto este consentimiento informado.',
    consent_accept: 'Firmar y Aceptar',

    // === ABOUT SCREEN ===
    about_title: 'Sobre la Aplicación',
    about_name: 'Nombre',
    about_version: 'Versión',
    about_developer: 'Desarrollador',
    about_contact: 'Contacto',
    about_indautor: 'Registro INDAUTOR',
    about_patent: 'Patente pendiente',
    about_patent_value: 'IMPI México',
    about_classification: 'Clasificación',
    about_classification_value: 'Software de monitoreo personal — No Dispositivo Médico',
    about_regulatory: 'Normativa de referencia',
    about_regulatory_value: 'LFPDPPP, NOM-024-SSA3-2012',

    // === HOME SCREEN ===
    home_title: 'Monitor de Salud',
    home_subtitle: 'Ingrese sus signos vitales manualmente',
    vital_heart_rate: 'Frecuencia Cardíaca (bpm)',
    vital_spo2: 'Saturación O₂ (%)',
    vital_systolic: 'Presión Sistólica (mmHg)',
    vital_diastolic: 'Presión Diastólica (mmHg)',
    vital_glucose: 'Glucosa (mg/dL)',
    vital_temperature: 'Temperatura (°C)',
    vital_submit: 'Detectar Patrones',
    vital_result: 'Reporte de Detección de Patrones',

    // === NAVIGATION ===
    nav_home:        'Inicio',
    nav_coach:       'Coach',    nav_coac:        'Coach',
    nav_history:     'Historial',
    nav_meds:        'Medicinas', nav_med:         'Medicinas',
    nav_more:        'Más',      nav_mor:         'Más',
    nav_medications: 'Medicinas',
    nav_profile:     'Perfil',
    nav_settings:    'Configuración',
    nav_about:       'Acerca de',

    // === AUDIT LOG ===
    audit_consent_accepted: 'Consentimiento informado aceptado',
    audit_privacy_accepted: 'Aviso de privacidad aceptado',
    audit_terms_accepted: 'Términos y condiciones aceptados',
    audit_vitals_entered: 'Signos vitales registrados',
    audit_disclaimer_ack: 'Disclaimer reconocido',
    audit_language_changed: 'Idioma cambiado',
  },

  en: {
    // === COMMON ===
    app_name: 'RmHealth',
    accept: 'Accept',
    decline: 'Decline',
    continue: 'Continue',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    language_label: 'EN 🇺🇸',
    language_switch: 'ES 🇲🇽',

    // === CLINICAL DISCLAIMER (persistent banner) ===
    disclaimer_banner: 'RmHealth is a personal monitoring tool. It is not a medical device, does not perform diagnoses, and does not replace professional medical consultation.',
    disclaimer_checkbox: 'I understand that this data is informational and does not constitute a medical diagnosis.',
    disclaimer_title: 'Important Notice',

    // === FDA / COFEPRIS UNIVERSAL LINE ===
    fda_line: 'This application is not intended to diagnose, treat, cure, or prevent any disease.',
    fda_reference: 'FDA General Wellness: Policy for Low Risk Devices',

    // === PRIVACY NOTICE ===
    privacy_title: 'Privacy Notice',
    privacy_controller: 'Data Controller',
    privacy_controller_value: 'Raúl Morales Zepeda / RmHealth — Acapulco, Guerrero, México',
    privacy_data_collected: 'Data Collected',
    privacy_data_collected_value: 'Name, age, vital signs manually entered by the user.',
    privacy_purpose: 'Purpose',
    privacy_purpose_value: 'Personal health monitoring — no clinical diagnosis. The information generated is strictly informational and does not replace the evaluation of a healthcare professional.',
    privacy_rights: 'Data Rights',
    privacy_rights_value: 'You have the right to Access, Rectify, Cancel, or Oppose the processing of your personal data. To exercise these rights, contact: contacto@rmhealth.ai',
    privacy_transfers: 'Data Sharing',
    privacy_transfers_value: 'Your data is not shared with third parties. All processing occurs within RmHealth\'s secure infrastructure (Google Cloud Platform).',
    privacy_accept: 'I Accept the Privacy Notice',
    privacy_decline: 'Decline',
    privacy_decline_message: 'You must accept the Privacy Notice to use RmHealth. The application will close.',
    privacy_law_reference: 'In compliance with the Mexican Federal Law on Protection of Personal Data Held by Private Parties (LFPDPPP) and its Regulations.',

    // === TERMS AND CONDITIONS ===
    terms_title: 'Terms and Conditions',
    terms_version: 'Version',
    terms_date: 'Date',
    terms_jurisdiction: 'Jurisdiction: Mexico',
    terms_body: `RmHealth is a personal health monitoring application intended solely for informational purposes. The information, data, and readings generated through this application do not constitute a medical diagnosis, prescription, treatment, or clinical advice of any kind, and shall not be interpreted as a substitute for the care, evaluation, or recommendation of a duly licensed healthcare professional.

The user acknowledges that vital signs data recorded in the application may be subject to margins of error, inaccuracies, or variations resulting from, among other factors: (i) the characteristics and limitations of the measurement device used; (ii) physiological or environmental conditions at the time of recording; (iii) manual data entry errors by the user; (iv) technical failures, connectivity interruptions, or force majeure events attributable to third parties, including network providers, hardware manufacturers, or operating system platforms.

RmHealth, its developer, and collaborators assume no liability whatsoever for medical, clinical, or emergency decisions made by the user or third parties based on information displayed by this application. In the event of any symptom, discomfort, or health risk situation, the user must immediately consult a medical professional or go to the nearest hospital.

Use of this application constitutes full acceptance of these terms.`,
    terms_accept: 'I Accept the Terms and Conditions',

    // === INFORMED CONSENT ===
    consent_title: 'Informed Consent',
    consent_intro: 'Before recording vital signs, please read and accept the following:',
    consent_data_what: 'What data is recorded?',
    consent_data_what_value: 'Heart rate, oxygen saturation, blood pressure, glucose, temperature — manually entered by you.',
    consent_data_why: 'How is the data used?',
    consent_data_why_value: 'To generate a personal record of health trends. This data is NOT reviewed by a medical professional within the application.',
    consent_self_reported: 'Self-reported data',
    consent_self_reported_value: 'Data is manually entered by the user. RmHealth does not verify the accuracy of the values entered.',
    consent_not_medical: 'Does not replace medical care',
    consent_not_medical_value: 'This application does NOT replace the consultation, diagnosis, or treatment of a healthcare professional.',
    consent_signature_label: 'Full name (digital signature)',
    consent_signature_placeholder: 'Type your full name',
    consent_checkbox: 'I have read and accept this informed consent.',
    consent_accept: 'Sign and Accept',

    // === ABOUT SCREEN ===
    about_title: 'About the Application',
    about_name: 'Name',
    about_version: 'Version',
    about_developer: 'Developer',
    about_contact: 'Contact',
    about_indautor: 'INDAUTOR Registration',
    about_patent: 'Patent pending',
    about_patent_value: 'IMPI Mexico',
    about_classification: 'Classification',
    about_classification_value: 'Personal monitoring software — Not a Medical Device',
    about_regulatory: 'Regulatory reference',
    about_regulatory_value: 'FDA General Wellness Policy (January 2026)',

    // === HOME SCREEN ===
    home_title: 'Health Monitor',
    home_subtitle: 'Enter your vital signs manually',
    vital_heart_rate: 'Heart Rate (bpm)',
    vital_spo2: 'O₂ Saturation (%)',
    vital_systolic: 'Systolic Pressure (mmHg)',
    vital_diastolic: 'Diastolic Pressure (mmHg)',
    vital_glucose: 'Glucose (mg/dL)',
    vital_temperature: 'Temperature (°C)',
    vital_submit: 'Submit Vital Signs',
    vital_result: 'Analysis Result',

    // === NAVIGATION ===
    nav_home:        'Home',
    nav_coach:       'Coach',    nav_coac:        'Coach',
    nav_history:     'History',
    nav_meds:        'Meds',     nav_med:         'Meds',
    nav_more:        'More',     nav_mor:         'More',
    nav_medications: 'Medications',
    nav_profile:     'Profile',
    nav_settings:    'Settings',
    nav_about:       'About',

    // === AUDIT LOG ===
    audit_consent_accepted: 'Informed consent accepted',
    audit_privacy_accepted: 'Privacy notice accepted',
    audit_terms_accepted: 'Terms and conditions accepted',
    audit_vitals_entered: 'Vital signs recorded',
    audit_disclaimer_ack: 'Disclaimer acknowledged',
    audit_language_changed: 'Language changed',
  },
};
