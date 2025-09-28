// App.tsx
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import WarningScreen from './src/screens/WarningScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import RecordScreen from './src/screens/RecordScreen';
import DrivesScreen from './src/screens/DrivesScreen';
import DriveDetailScreen from './src/screens/DriveDetailScreen';
import ConvoyScreen from './src/screens/ConvoyScreen';
import GarageScreen from './src/screens/GarageScreen';
import DirectionsScreen from './src/screens/DirectionsScreen';
import ConvoyNavigator from './src/navigation/ConvoyNavigator';

import { useDrives } from './src/state/useDrives';
import './src/background/locationTask';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ✅ Export this so other screens can import it (DriveDetailScreen does)
export type RootStackParamList = {
  Warning: undefined;
  Welcome: undefined;
  Tabs: undefined;
  DriveDetail: { id: string };
};

function withSafeArea(Component: React.ComponentType<any>) {
  return (props: any) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0B1020' }}>
      <Component {...props} />
    </SafeAreaView>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#0B1020', borderTopColor: '#111827' },
        tabBarLabelStyle: { fontSize: 11, marginBottom: 4 },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: string;
          switch (route.name) {
            case 'Record':
              iconName = focused ? 'radio-button-on' : 'radio-button-off';
              break;
            case 'Drives':
              iconName = focused ? 'time' : 'time-outline';
              break;
            case 'Directions':
              iconName = focused ? 'map' : 'map-outline';
              break;
            case 'Garage':
              iconName = focused ? 'person' : 'person-outline';
              break;
            case 'Convoy':
              iconName = focused ? 'navigate' : 'navigate-outline';
              break;
            default:
              iconName = 'ellipse';
          }
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Record" component={withSafeArea(RecordScreen)} />
      <Tab.Screen name="Drives" component={withSafeArea(DrivesScreen)} />
      <Tab.Screen name="Directions" component={withSafeArea(DirectionsScreen)} />
      <Tab.Screen name="Garage" component={withSafeArea(GarageScreen)} />
      <Tab.Screen name="Convoy" component={ConvoyNavigator} options={{ title: 'Convoy' }} />
    </Tab.Navigator>
  );
}


export default function App() {
  const hydrate = useDrives((s) => s._hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Warning">
          <Stack.Screen name="Warning" component={withSafeArea(WarningScreen)} />
          <Stack.Screen name="Welcome" component={withSafeArea(WelcomeScreen)} />
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen
            name="DriveDetail"
            component={withSafeArea(DriveDetailScreen)}
            options={{ headerShown: true, title: 'Drive Detail' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
