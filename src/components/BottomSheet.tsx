// src/components/BottomSheet.tsx
import React, { useRef } from 'react';
import { Animated, PanResponder, View, StyleSheet } from 'react-native';

type Props = {
  initialHeight?: number;    // e.g., 140
  maxHeight?: number;        // e.g., 360
  children: React.ReactNode;
};

export default function BottomSheet({ initialHeight = 160, maxHeight = 360, children }: Props) {
  const height = useRef(new Animated.Value(initialHeight)).current;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        const next = Math.min(Math.max(initialHeight, initialHeight + -g.dy), maxHeight);
        height.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const mid = (initialHeight + maxHeight) / 2;
        const target = height.__getValue() > mid ? maxHeight : initialHeight;
        Animated.spring(height, { toValue: target, useNativeDriver: false, friction: 7, tension: 60 }).start();
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.sheet, { height }]}>
      <View {...responder.panHandlers} style={styles.handleArea}>
        <View style={styles.handle} />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#0B1020',
    borderTopWidth: 1, borderColor: '#111827',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#374151' },
});
