import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import GAME_HTML from './game-html';

// The whole game is the web build (brickmaster/index.html) running in a WebView.
// Two bridges: the save file is mirrored to AsyncStorage, and game vibrations become native haptics.
const SAVE_KEY = 'brickmaster.save.v1';
const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export default function App() {
  // Script injected before the game boots; it hands over the save kept in native storage.
  const [boot, setBoot] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(SAVE_KEY)
      .catch(() => null)
      .then((saved) => setBoot(`window.__BM_SAVE = ${JSON.stringify(saved || '')}; true;`));
  }, []);

  const onMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'save' && typeof msg.data === 'string') {
      AsyncStorage.setItem(SAVE_KEY, msg.data).catch(() => {});
    } else if (msg.t === 'haptic') {
      Haptics.impactAsync(IMPACT[msg.s] || IMPACT.light).catch(() => {});
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {boot === null ? (
        <ActivityIndicator style={styles.root} color="#5ef2e0" />
      ) : (
        <WebView
          style={styles.root}
          originWhitelist={['*']}
          source={{ html: GAME_HTML, baseUrl: 'https://brickmaster.local/' }}
          injectedJavaScriptBeforeContentLoaded={boot}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          textZoom={100}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070912' },
});
