import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { SimPoint, LatLng } from "./SimLocationPlayer";
import { SimLocationPlayer } from "./SimLocationPlayer";

type Props = {
  // Route coordinates to simulate (lat/lng):
  routeCoords: LatLng[];

  // Inject into your RecordScreen state/logic:
  pushSimPosition: (p: SimPoint) => void;

  // Optional UI tweak:
  label?: string;
};

export default function DevTestPanel({ routeCoords, pushSimPosition, label = "DEV • Sim Drive" }: Props) {
  const [running, setRunning] = useState(false);
  const playerRef = useRef<SimLocationPlayer | null>(null);

  const player = useMemo(() => {
    return new SimLocationPlayer(
      routeCoords,
      (p) => pushSimPosition(p),
      { intervalMs: 800, loop: false, jitterMeters: 2.5 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(routeCoords)]);

  function start() {
    if (running || !routeCoords.length) return;
    playerRef.current = player;
    player.start();
    setRunning(true);
  }

  function stop() {
    playerRef.current?.stop();
    setRunning(false);
  }

  return (
    <View
      style={{
        position: "absolute",
        right: 12,
        bottom: 24,
        gap: 8,
        padding: 10,
        borderRadius: 12,
        backgroundColor: "rgba(20,20,20,0.88)",
        borderWidth: 1,
        borderColor: "#111827",
      }}
      pointerEvents="box-none"
    >
      <Text style={{ color: "white", fontWeight: "800" }}>{label}</Text>

      <Pressable
        onPress={start}
        disabled={running}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: running ? "#6b7280" : "#22c55e",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>
          {running ? "Running…" : "Start Sim"}
        </Text>
      </Pressable>

      <Pressable
        onPress={stop}
        disabled={!running}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: !running ? "#6b7280" : "#ef4444",
        }}
      >
        <Text style={{ color: "white", fontWeight: "700" }}>Stop</Text>
      </Pressable>

      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
        {routeCoords.length} pts
      </Text>
    </View>
  );
}
