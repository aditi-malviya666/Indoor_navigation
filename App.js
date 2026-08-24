/**
 * App.js — Root navigation stack with permission gate.
 * Permissions are checked on launch; if not granted, PermissionScreen is shown first.
 */
import React, { useEffect, useState } from "react";
import { StatusBar, ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { arePermissionsGranted } from "./src/utils/permissions";

import PermissionScreen      from "./src/screens/PermissionScreen";
import HomeScreen            from "./src/screens/HomeScreen";
import RecordingScreen       from "./src/screens/RecordingScreen";
import MapGenerationScreen   from "./src/screens/MapGenerationScreen";
import NavigationScreen      from "./src/screens/NavigationScreen";
import RelocalizationScreen  from "./src/screens/RelocalizationScreen";

const Stack = createStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    arePermissionsGranted().then(granted => {
      setInitialRoute(granted ? "Home" : "Permissions");
    });
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex:1, backgroundColor:"#0b0f19", justifyContent:"center", alignItems:"center" }}>
        <ActivityIndicator color="#38bdf8" size="large"/>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19"/>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: "#0b0f19" },
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="Permissions"     component={PermissionScreen}     />
        <Stack.Screen name="Home"            component={HomeScreen}           />
        <Stack.Screen name="Recording"       component={RecordingScreen}      />
        <Stack.Screen name="MapGeneration"   component={MapGenerationScreen}  />
        <Stack.Screen name="Navigation"      component={NavigationScreen}     />
        <Stack.Screen name="Relocalization"  component={RelocalizationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
