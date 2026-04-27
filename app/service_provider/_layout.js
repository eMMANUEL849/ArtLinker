import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function ServiceProviderLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4F6BFF",
        tabBarInactiveTintColor: "#CFCFE8",
        tabBarStyle: {
          height: 100,
          paddingTop: 4,
          paddingBottom: 30,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Hidden Upload Screen */}
      <Tabs.Screen
        name="upload"
        options={{
          href: null, // 👈 hides from tab bar
        }}
      />
      
<Tabs.Screen
        name="editshop"
        options={{
          href: null, // 👈 hides from tab bar

        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null, // 👈 hides from tab bar

        }}
      />
       <Tabs.Screen
        name="dms"
        options={{
          href: null, // 👈 hides from tab bar

        }}
      />
      
       <Tabs.Screen
        name="withdraw"
        options={{
          href: null, // 👈 hides from tab bar

        }}
      />

      <Tabs.Screen 
      name="settings"
      options={{
        href: null, 
      }} />

      <Tabs.Screen
        name="myshop"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
       <Tabs.Screen
        name="requests"
        options={{
          title: "Requests",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}