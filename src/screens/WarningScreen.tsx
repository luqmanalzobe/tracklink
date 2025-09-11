// src/screens/WarningScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function WarningScreen({ navigation }: any) {
  const glow = useRef(new Animated.Value(0)).current;
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const shadowRadius = glow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] });

  const onContinue = () => {
    if (!checked) return;
    navigation.replace('Welcome'); // <-- always show Warning first; no persistence
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020' }}>
      <LinearGradient
        colors={['#0B1020', '#111827', '#0B1020']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Animated.Text
            style={{
              color: '#ff375f',
              fontSize: 40,
              fontWeight: '900',
              letterSpacing: 2,
              textTransform: 'uppercase',
              textShadowColor: '#ff375f',
              textShadowRadius: shadowRadius as unknown as number,
              textShadowOffset: { width: 0, height: 0 },
            }}
          >
            Drive Safe
          </Animated.Text>

          <Text style={{ color: '#fff', opacity: 0.85, textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
            Tracklink is for logging and sharing your drives.{'\n'}
            <Text style={{ fontWeight: '700' }}>Do not interact</Text> with the app while the vehicle is moving.
          </Text>

          <View style={{ marginTop: 20 }}>
            <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>By continuing you acknowledge:</Text>
            <Text style={styles.bullet}>• You’ll obey all laws and speed limits.</Text>
            <Text style={styles.bullet}>• Recording runs in the background—eyes on the road.</Text>
            <Text style={styles.bullet}>• Location is used to create your route.</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setChecked((v) => !v)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor: checked ? 'rgba(79,70,229,0.25)' : 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: checked ? '#4f46e5' : 'rgba(255,255,255,0.15)',
          }}
        >
          <View
            style={{
              width: 20, height: 20, borderRadius: 4, borderWidth: 2,
              borderColor: checked ? '#4f46e5' : '#9CA3AF',
              backgroundColor: checked ? '#4f46e5' : 'transparent',
            }}
          />
          <Text style={{ color: '#fff', flex: 1 }}>I understand and will not use the app while driving.</Text>
        </Pressable>

        <Pressable
          onPress={onContinue}
          disabled={!checked}
          style={{
            backgroundColor: checked ? '#4f46e5' : '#374151',
            padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12,
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Continue</Text>
        </Pressable>

        <Text style={{ color: '#6B7280', textAlign: 'center', marginTop: 6, fontSize: 12 }}>
          Don’t race on public roads. Tracklink encourages safe, legal driving.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { color: '#D1D5DB', marginTop: 6 },
});
