// GarageScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PhotoMeta = { width: number; height: number; aspectRatio: number };

type Car = {
  id: string;
  make: string;
  model: string;
  year: string;
  color?: string;
  plate?: string;
  nickname?: string;
  photoUri?: string;
  photoMeta?: PhotoMeta;
};

const STORAGE_KEYS = {
  cars: 'garage.cars',
  currentId: 'garage.currentId',
};

export default function GarageScreen() {
  const [cars, setCars] = useState<Car[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Add/Edit modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Car>>({});
  const editingId = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rawCars, rawCurrent] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.cars),
          AsyncStorage.getItem(STORAGE_KEYS.currentId),
        ]);
        if (rawCars) setCars(JSON.parse(rawCars));
        if (rawCurrent) setCurrentId(rawCurrent);
      } catch (e) {
        console.warn('Failed to load garage', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.cars, JSON.stringify(cars)).catch(() => {});
  }, [cars]);

  const currentCar = useMemo(() => cars.find(c => c.id === currentId) ?? null, [cars, currentId]);

  const openAdd = () => {
    editingId.current = null;
    setForm({ make: '', model: '', year: '', color: '', plate: '', nickname: '', photoUri: '', photoMeta: undefined });
    setOpen(true);
  };

  const openEdit = (car: Car) => {
    editingId.current = car.id;
    setForm({ ...car });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    editingId.current = null;
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to attach a car photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false, // keep original ratio; no forced crop
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const width = asset.width ?? 4;
      const height = asset.height ?? 3;
      const aspectRatio = width / height;
      setForm(prev => ({
        ...prev,
        photoUri: asset.uri,
        photoMeta: { width, height, aspectRatio },
      }));
    }
  };

  const saveCar = () => {
    const make = (form.make || '').trim();
    const model = (form.model || '').trim();
    const year = (form.year || '').trim();

    if (!make || !model || !year) {
      Alert.alert('Missing info', 'Please enter at least make, model, and year.');
      return;
    }
    if (!/^\d{4}$/.test(year)) {
      Alert.alert('Invalid year', 'Year should be 4 digits, e.g., 2016.');
      return;
    }

    if (editingId.current) {
      setCars(prev =>
        prev.map(c =>
          c.id === editingId.current
            ? {
                ...(c as Car),
                ...form,
                make,
                model,
                year,
              }
            : c,
        ),
      );
    } else {
      const id = `${Date.now()}`;
      const newCar: Car = {
        id,
        make,
        model,
        year,
        color: form.color?.trim(),
        plate: form.plate?.trim(),
        nickname: form.nickname?.trim(),
        photoUri: form.photoUri,
        photoMeta: form.photoMeta,
      };
      setCars(prev => [newCar, ...prev]);
      if (!currentId) setCurrentRide(id);
    }
    closeModal();
  };

  const setCurrentRide = async (id: string) => {
    setCurrentId(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.currentId, id);
    } catch {}
  };

  const deleteCar = (car: Car) => {
    Alert.alert('Delete Vehicle', `Remove ${labelFor(car)} from your garage?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setCars(prev => prev.filter(c => c.id !== car.id));
          if (currentId === car.id) {
            setCurrentRideAfterDelete();
          }
        },
      },
    ]);
  };

  const setCurrentRideAfterDelete = () => {
    setTimeout(() => {
      setCurrentId(prev => {
        const next = cars.find(c => c.id !== prev)?.id ?? null;
        if (next) AsyncStorage.setItem(STORAGE_KEYS.currentId, next).catch(() => {});
        else AsyncStorage.removeItem(STORAGE_KEYS.currentId).catch(() => {});
        return next;
      });
    }, 0);
  };

  const labelFor = (c: Car) =>
    [c.nickname, `${c.year} ${c.make} ${c.model}`.trim()].find(Boolean) || 'Vehicle';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1020', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const isEmpty = cars.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1020', padding: 16 }}>
      <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Garage</Text>
      <Text style={{ color: '#9CA3AF' }}>
        Add your cars, choose your current ride, and customize your profile.
      </Text>

      {/* Current ride badge */}
      {currentCar && (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: '#111827',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#1f2937',
          }}
        >
          <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>Current ride</Text>
          <Text style={{ color: 'white', fontWeight: '700' }}>{labelFor(currentCar)}</Text>
        </View>
      )}

      {/* Only show the big Add button when garage is empty */}
      {isEmpty && (
        <Pressable
          style={{
            marginTop: 16,
            backgroundColor: '#4f46e5',
            padding: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
          onPress={openAdd}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Add Car</Text>
        </Pressable>
      )}

      {/* Cars list */}
      <FlatList
        style={{ marginTop: 20 }}
        data={cars}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <Text style={{ color: '#6B7280', marginTop: 24 }}>No vehicles yet. Add your first car.</Text>
        }
        renderItem={({ item }) => (
          <View
            style={{
              marginBottom: 12,
              backgroundColor: '#0F172A',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#1f2937',
              overflow: 'hidden',
            }}
          >
            {item.photoUri ? (
              <AdaptivePhoto uri={item.photoUri} meta={item.photoMeta} />
            ) : (
              <View
                style={{
                  width: '100%',
                  height: 140,
                  backgroundColor: '#111827',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#6B7280' }}>No photo</Text>
              </View>
            )}

            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>{labelFor(item)}</Text>
              <Text style={{ color: '#9CA3AF' }}>
                {item.year} {item.make} {item.model}
                {item.color ? ` • ${item.color}` : ''}
                {item.plate ? ` • ${item.plate}` : ''}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => setCurrentRide(item.id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: currentId === item.id ? '#10b981' : '#1f2937',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: currentId === item.id ? '#059669' : '#374151',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '700' }}>
                    {currentId === item.id ? 'Current' : 'Set Current'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => openEdit(item)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: '#1f2937',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#374151',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '700' }}>Edit</Text>
                </Pressable>

                <Pressable
                  onPress={() => deleteCar(item)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: '#1f2937',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#ef4444',
                  }}
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />

      {/* Floating + button when there is at least one car */}
      {!isEmpty && (
        <Pressable
          onPress={openAdd}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#4f46e5',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 6,
          }}
          accessibilityLabel="Add Vehicle"
        >
          <Text style={{ color: 'white', fontSize: 28, lineHeight: 28, fontWeight: '800' }}>＋</Text>
        </Pressable>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: '#0B1020',
              padding: 16,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderWidth: 1,
              borderColor: '#1f2937',
              gap: 10,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#374151' }} />
            </View>
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
              {editingId.current ? 'Edit Vehicle' : 'Add Vehicle'}
            </Text>

            {/* Photo (adaptive) */}
            <Pressable
              onPress={pickImage}
              style={{
                marginTop: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#374151',
                backgroundColor: '#0F172A',
                overflow: 'hidden',
              }}
            >
              {form.photoUri ? (
                <AdaptivePhoto uri={form.photoUri} meta={form.photoMeta} />
              ) : (
                <View
                  style={{
                    height: 140,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#9CA3AF' }}>Tap to add photo</Text>
                </View>
              )}
            </Pressable>

            {/* Inputs */}
            <Row>
              <Field label="Make *" value={form.make ?? ''} onChangeText={t => setForm(s => ({ ...s, make: t }))} />
              <Field label="Model *" value={form.model ?? ''} onChangeText={t => setForm(s => ({ ...s, model: t }))} />
            </Row>

            <Row>
              <Field
                label="Year *"
                value={form.year ?? ''}
                keyboardType="number-pad"
                onChangeText={t => setForm(s => ({ ...s, year: t }))}
              />
              <Field label="Color" value={form.color ?? ''} onChangeText={t => setForm(s => ({ ...s, color: t }))} />
            </Row>

            <Row>
              <Field label="Plate" value={form.plate ?? ''} onChangeText={t => setForm(s => ({ ...s, plate: t }))} />
              <Field
                label="Nickname"
                value={form.nickname ?? ''}
                onChangeText={t => setForm(s => ({ ...s, nickname: t }))}
              />
            </Row>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={closeModal}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#374151',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveCar}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: '#4f46e5',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>
                  {editingId.current ? 'Save' : 'Add'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* --- Adaptive photo renderer --- */
function AdaptivePhoto({ uri, meta }: { uri: string; meta?: PhotoMeta }) {
  const [ratio, setRatio] = useState<number | null>(meta?.aspectRatio ?? null);

  useEffect(() => {
    if (!ratio) {
      // Fallback: query size from uri to compute aspect ratio once
      Image.getSize(
        uri,
        (w, h) => setRatio(w / h),
        () => setRatio(16 / 9), // safe default if unknown
      );
    }
  }, [uri]);

  if (!ratio) {
    // Temporary skeleton with sensible height while loading ratio
    return <View style={{ width: '100%', height: 160, backgroundColor: '#111827' }} />;
  }

  return (
    <Image
      source={{ uri }}
      style={{
        width: '100%',
        // Height is automatically derived from width by aspectRatio (prevents cropping)
        aspectRatio: ratio,
      }}
      // 'cover' would crop; 'contain' plus aspectRatio gives full image without letterboxing
      resizeMode="contain"
    />
  );
}

/* --- Small UI helpers --- */

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>;
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'numeric' | 'phone-pad';
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder=""
        placeholderTextColor="#6B7280"
        style={{
          color: 'white',
          backgroundColor: '#0F172A',
          borderWidth: 1,
          borderColor: '#374151',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />
    </View>
  );
}
