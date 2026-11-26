import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { useTheme } from '@/constants/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function TabsLayout() {
  const t = useTheme();
  const { account } = useAuth();
  const [unread, setUnread] = useState(0);

  // The Messages badge: conversations with something new (/api/dm/unread).
  useEffect(() => {
    if (!account) {
      setUnread(0);
      return;
    }
    const load = () => api<{ count: number }>('/api/dm/unread').then((r) => setUnread(r.count || 0), () => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [account]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.textSecondary,
        headerTitleStyle: { fontWeight: '900', color: t.text },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pets',
          headerTitle: 'PuppyPlace Pets',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'paw' : 'paw-outline'} color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'List a pet',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: t.brand },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color as string} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} color={color as string} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
