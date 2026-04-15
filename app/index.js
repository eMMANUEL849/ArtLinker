import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function Index() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const logoSize = Math.min(width * 0.5, 200);
  const contentWidth = Math.min(width * 0.88, 380);
  const buttonWidth = Math.min(width * 0.82, 320);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#0f0f14', '#1a1b2f', '#2d1e52', '#3b2175']}
        style={styles.background}
      >
        <View style={[styles.container, { paddingHorizontal: width * 0.06 }]}>
          
          {/* Circular Logo */}
          <View
            style={{
              width: logoSize + 30,
              height: logoSize + 30,
              borderRadius: (logoSize + 30) / 2,
              backgroundColor: 'rgba(255,255,255,0.08)',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 30,
              shadowColor: '#8b5cf6',
              shadowOpacity: 0.4,
              shadowRadius: 20,
              elevation: 15,
            }}
          >
            <Image
              source={require('../assets/images/logo.png')}
              style={{
                width: logoSize,
                height: logoSize,
                borderRadius: logoSize / 2, // makes image circular
              }}
              resizeMode="cover"
            />
          </View>

          {/* Text Section */}
          <View style={[styles.textBlock, { width: contentWidth }]}>
            

            <Text style={[styles.tagline, { fontSize: Math.max(18, width * 0.05) }]}>
  Create. Showcase. Sell.
</Text>

            <Text style={[styles.description, { fontSize: Math.max(14, width * 0.037) }]}>
  A premium platform for artists to share their work, build portfolios,
  connect with a global creative community, and sell their artwork with ease.
</Text>
          </View>

          {/* Button */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { width: buttonWidth, paddingVertical: Math.max(14, height * 0.02) },
            ]}
            onPress={() => router.push('/auth/register')}
          >
            <Text style={[styles.primaryText, { fontSize: Math.max(16, width * 0.043) }]}>
              Get Started
            </Text>
          </TouchableOpacity>

          {/* Secondary */}
          <TouchableOpacity
            style={[styles.secondaryButton, { width: buttonWidth }]}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={[styles.secondaryText, { fontSize: Math.max(14, width * 0.038) }]}>
              Already have an account? Sign In
            </Text>
          </TouchableOpacity>

        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f14',
  },
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 35,
  },
  brand: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  tagline: {
    color: '#c4b5fd',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
  description: {
    color: '#b8b8c7',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#8b5cf6',
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#9ca3af',
    textAlign: 'center',
  },
});