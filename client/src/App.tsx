import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { sessionStore } from './stores/SessionStore';
import { Layout } from './components/Layout';

export const App = observer(() => {
  useEffect(() => {
    sessionStore.loadSessions();
  }, []);

  return <Layout store={sessionStore} />;
});
