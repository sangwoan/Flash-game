import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import GAME_HTML from './game-html';

// The whole game is the web build (brickmaster/index.html) running in a WebView.
// Bridges: the save file is mirrored to AsyncStorage, game vibrations become native haptics, the
// Android back button goes to the game (pause / close a menu; on the home screen it leaves the app),
// and the game pauses when the app goes to the background.
const SAVE_KEY = 'brickmaster.save.v1';
const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export default function App() {
  // Script injected before the game boots; it hands over the save kept in native storage.
  const [boot, setBoot] = useState(null);
  const web = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(SAVE_KEY)
      .catch(() => null)
      .then((saved) => setBoot(`window.__BM_SAVE = ${JSON.stringify(saved || '')}; true;`));
  }, []);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      web.current?.injectJavaScript('window.__bmBack && window.__bmBack(); true;');
      return true; // the game decides; it asks to exit from the home screen
    });
    const state = AppState.addEventListener('change', (s) => {
      if (s !== 'active') web.current?.injectJavaScript('window.__bmPause && window.__bmPause(); true;');
    });
    return () => { back.remove(); state.remove(); };
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
    } else if (msg.t === 'exit') {
      BackHandler.exitApp();
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {boot === null ? (
        <ActivityIndicator style={styles.root} color="#5ef2e0" />
      ) : (
        <WebView
          ref={web}
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
