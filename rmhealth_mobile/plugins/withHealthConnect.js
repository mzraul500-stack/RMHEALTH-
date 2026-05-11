const { withAndroidManifest, withMainActivity, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withHealthConnectManifest = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add permissions
    const permissions = [
      'android.permission.health.READ_HEART_RATE',
      'android.permission.health.READ_OXYGEN_SATURATION',
      'android.permission.health.READ_BODY_TEMPERATURE',
      'android.permission.health.READ_BLOOD_PRESSURE'
    ];

    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    permissions.forEach((permission) => {
      const exists = androidManifest.manifest['uses-permission'].some(
        (p) => p.$['android:name'] === permission
      );
      if (!exists) {
        androidManifest.manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add Rationale Intent Filter to MainActivity
    const mainActivity = mainApplication.activity.find(
      (a) => a.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
      }

      let hasRationale = false;
      for (const filter of mainActivity['intent-filter']) {
        if (filter.action) {
          const hasAction = filter.action.some(
            (action) => action.$['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE'
          );
          if (hasAction) {
            hasRationale = true;
            break;
          }
        }
      }

      if (!hasRationale) {
        mainActivity['intent-filter'].push({
          action: [
            { $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }
          ]
        });
      }
    }

    // Add intent query for Health Connect app
    if (!androidManifest.manifest.queries) {
      androidManifest.manifest.queries = [];
    }

    const queries = androidManifest.manifest.queries;
    
    let hasPackage = false;
    for (const query of queries) {
      if (query.package) {
        const hasHealthConnect = query.package.some(p => p.$ && p.$['android:name'] === 'com.google.android.apps.healthdata');
        if (hasHealthConnect) {
          hasPackage = true;
          break;
        }
      }
    }

    if (!hasPackage) {
      queries.push({
        package: [
          {
            $: {
              'android:name': 'com.google.android.apps.healthdata'
            }
          }
        ]
      });
    }

    // Add meta-data for health_permissions
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const hasHealthPermissionsMeta = mainApplication['meta-data'].some(
      (m) => m.$['android:name'] === 'health_permissions'
    );

    if (!hasHealthPermissionsMeta) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'health_permissions',
          'android:resource': '@array/health_permissions'
        }
      });
    }

    return config;
  });
};

const withHealthConnectActivity = (config) => {
  return withMainActivity(config, async (config) => {
    let contents = config.modResults.contents;

    // Inject import
    if (!contents.includes('dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate')) {
      contents = contents.replace(
        'import android.os.Bundle',
        'import android.os.Bundle\nimport dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
      );
    }

    // Inject delegate in onCreate
    const onCreateRegex = /(override\s+fun\s+onCreate\s*\([^)]*\)\s*\{[\s\S]*?super\.onCreate\([^)]*\))/;
    if (contents.match(onCreateRegex) && !contents.includes('HealthConnectPermissionDelegate.setPermissionDelegate(this)')) {
      contents = contents.replace(
        onCreateRegex,
        '$1\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

const withHealthConnectPermissionsArray = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/values');
      fs.mkdirSync(resDir, { recursive: true });
      
      const permissionsXmlPath = path.join(resDir, 'health_permissions.xml');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <array name="health_permissions">
        <item>android.permission.health.READ_HEART_RATE</item>
        <item>android.permission.health.READ_OXYGEN_SATURATION</item>
        <item>android.permission.health.READ_BODY_TEMPERATURE</item>
        <item>android.permission.health.READ_BLOOD_PRESSURE</item>
    </array>
</resources>`;
      
      fs.writeFileSync(permissionsXmlPath, xmlContent);
      return config;
    },
  ]);
};

const withHealthConnect = (config) => {
  config = withHealthConnectManifest(config);
  config = withHealthConnectActivity(config);
  config = withHealthConnectPermissionsArray(config);
  return config;
};

module.exports = withHealthConnect;
