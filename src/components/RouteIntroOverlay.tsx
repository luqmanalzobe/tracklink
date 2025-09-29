// src/components/RouteIntroOverlay.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

type IntroProps = {
  visible: boolean;
  onDone?: () => void;
  startLabel?: string;
  endLabel?: string;
};

export function RouteIntroOverlay({
  visible,
  onDone,
  startLabel = 'START',
  endLabel = 'END',
}: IntroProps) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const line1Opacity = useRef(new Animated.Value(0)).current;
  const line2Opacity = useRef(new Animated.Value(0)).current;
  const readyOpacity = useRef(new Animated.Value(0)).current;
  const readyScale = useRef(new Animated.Value(0.85)).current;

  // helper to await an animation
  const run = (anim: Animated.CompositeAnimation) =>
    new Promise<void>((resolve) => anim.start(() => resolve()));

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    // reset for replays
    overlayOpacity.setValue(0);
    line1Opacity.setValue(0);
    line2Opacity.setValue(0);
    readyOpacity.setValue(0);
    readyScale.setValue(0.85);

    (async () => {
      // Fade in black overlay
      await run(
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      );

      // INITIALIZING…
      await run(
        Animated.timing(line1Opacity, {
          toValue: 1,
          duration: 320,
          delay: 200,
          useNativeDriver: true,
        })
      );

      // START & END POINTS INITIALIZED
      await run(
        Animated.timing(line2Opacity, {
          toValue: 1,
          duration: 320,
          delay: 280,
          useNativeDriver: true,
        })
      );

      // Brief pause before READY!
      await run(Animated.delay(350));

      // READY! pops in (slower spring)
      await run(
        Animated.parallel([
          Animated.timing(readyOpacity, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.spring(readyScale, {
            toValue: 1,
            friction: 8, // slower settle
            tension: 90, // softer pop
            useNativeDriver: true,
          }),
        ])
      );

      if (!cancelled) {
        // success haptic when READY! lands
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        ).catch(() => {});
      }

      // Hold the moment
      await run(Animated.delay(900));

      // Fade everything out smoothly
      await run(
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        })
      );

      if (!cancelled) onDone?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity: overlayOpacity }]}
    >
      {/* crosshair overlay */}
      <View style={styles.grid}>
        <View style={styles.vLine} />
        <View style={styles.hLine} />
      </View>

      <Animated.Text style={[styles.top, { opacity: line1Opacity }]}>
        INITIALIZING…
      </Animated.Text>

      <Animated.Text style={[styles.mid, { opacity: line2Opacity }]}>
        {startLabel} & {endLabel} POINTS INITIALIZED
      </Animated.Text>

      <Animated.Text
        style={[
          styles.ready,
          { opacity: readyOpacity, transform: [{ scale: readyScale }] },
        ]}
      >
        READY!
      </Animated.Text>

      <Animated.Text style={[styles.bottom, { opacity: readyOpacity }]}>
        DRIVE THROUGH START TO BEGIN
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
  },
  vLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#fff',
  },
  hLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#fff',
  },
  top: {
    color: '#9CA3AF',
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 16,
  },
  mid: {
    color: '#E5E7EB',
    fontSize: 16,
    letterSpacing: 1.5,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: 24,
  },
  ready: {
    marginTop: 28,
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(255,255,255,0.25)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  bottom: {
    position: 'absolute',
    bottom: 60,
    color: '#9CA3AF',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
