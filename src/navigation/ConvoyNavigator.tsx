import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConvoyHomeScreen from '../screens/convoy/ConvoyHomeScreen';
import ConvoyMapScreen from '../screens/convoy/ConvoyMapScreen';

const Stack = createNativeStackNavigator();

export default function ConvoyNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0B1020' }, headerTintColor: 'white', headerTitleStyle: { fontWeight: '800' } }}>
      <Stack.Screen name="ConvoyHome" component={ConvoyHomeScreen} options={{ title: 'Convoy' }} />
      <Stack.Screen name="ConvoyMap" component={ConvoyMapScreen} options={{ title: 'Convoy Map' }} />
    </Stack.Navigator>
  );
}
