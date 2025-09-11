import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, FlatList, Text, Pressable, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';

type Prediction = { description: string; place_id: string };
type Props = {
  placeholder?: string;
  onPlaceSelected: (arg: { description: string; lat: number; lng: number }) => void;
};

const GOOGLE_KEY = (Constants.expoConfig?.extra as any)?.googleMapsKey as string;

export default function PlacesSearch({ placeholder = 'Search destination', onPlaceSelected }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!GOOGLE_KEY) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setPreds([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const url =
          'https://maps.googleapis.com/maps/api/place/autocomplete/json' +
          `?input=${encodeURIComponent(query)}` +
          `&types=geocode&language=en&key=${GOOGLE_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        const list: Prediction[] = Array.isArray(data?.predictions) ? data.predictions : [];
        setPreds(list);
      } catch {
        setPreds([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const fetchDetails = async (place_id: string, description: string) => {
    try {
      const url =
        'https://maps.googleapis.com/maps/api/place/details/json' +
        `?place_id=${encodeURIComponent(place_id)}` +
        `&fields=geometry/location&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const ll = data?.result?.geometry?.location;
      if (ll && typeof ll.lat === 'number' && typeof ll.lng === 'number') {
        onPlaceSelected({ description, lat: ll.lat, lng: ll.lng });
        setPreds([]);
      }
    } catch {
      // ignore — keep UI stable
    }
  };

  return (
    <View style={{ zIndex: 20 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={{
          height: 44,
          color: 'white',
          backgroundColor: '#111827',
          borderRadius: 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: '#1f2937',
        }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {loading ? (
        <View style={{ padding: 10 }}>
          <ActivityIndicator />
        </View>
      ) : null}

      {preds.length > 0 && (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={preds}
          keyExtractor={(item) => item.place_id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => fetchDetails(item.place_id, item.description)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 8,
                backgroundColor: '#111827',
                borderBottomWidth: 1,
                borderColor: '#1f2937',
              }}
            >
              <Text style={{ color: '#e5e7eb' }}>{item.description}</Text>
            </Pressable>
          )}
          style={{
            maxHeight: 240,
            backgroundColor: '#111827',
            borderRadius: 10,
            marginTop: 6,
            elevation: 20,
          }}
        />
      )}
    </View>
  );
}
