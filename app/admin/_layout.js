import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4a63ff",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: "#ffffff",
          borderTopWidth: 0.5,
          borderTopColor: "#e5e7eb",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="artworks"
        options={{
          title: "Artworks",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="image-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profiles"
        options={{
          title: "Profiles",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}