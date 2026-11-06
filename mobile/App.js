import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";

const TEMPLE_URL = "https://thiepcuoi.trandao.io.vn/";

export default function App() {
  useKeepAwake();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setVisibilityAsync("hidden").catch(() => {});
  }, []);

  function reload() {
    setFailed(false);
    setReady(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        key={reloadKey}
        source={{ uri: TEMPLE_URL }}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        onLoadEnd={() => setReady(true)}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
      {!ready && !failed ? (
        <View style={styles.cover}>
          <ActivityIndicator color="#e7c56a" size="large" />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.cover}>
          <Text style={styles.message}>Không mở được chính điện.</Text>
          <Pressable onPress={reload} style={styles.button}>
            <Text style={styles.buttonText}>Tải lại</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1a100c",
  },
  web: {
    flex: 1,
    backgroundColor: "#1a100c",
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a100c",
    gap: 16,
  },
  message: {
    color: "#f3e6c8",
    fontSize: 18,
  },
  button: {
    backgroundColor: "#7c1b28",
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  buttonText: {
    color: "#f3e6c8",
    fontSize: 16,
  },
});
