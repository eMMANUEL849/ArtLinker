import { StyleSheet, View } from "react-native";

export default function AuthBackground({ children }) {
  return <View style={styles.background}>{children}</View>;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#FFF7ED",
  },
});