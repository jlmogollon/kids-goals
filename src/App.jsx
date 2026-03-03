// src/App.jsx
import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { resetDailyTasks } from './store/tasksSlice'; // Adjust this import according to your project structure

const App = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const currentDate = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD

    const lastResetDate = localStorage.getItem('lastResetDate');

    if (lastResetDate !== currentDate) {
      dispatch(resetDailyTasks());
      localStorage.setItem('lastResetDate', currentDate);
    }
  }, [dispatch]);

  return (
    <div>
      {/* Your component code */}
    </div>
  );
};

export default App;