import React, { useState, useEffect } from 'react';
import { getDishes, addDish } from '../utils/api';

function Dishes() {
  const [dishes, setDishes] = useState([]);
  const [newDish, setNewDish] = useState('');

  useEffect(() => {
    const fetchDishes = async () => {
      const data = await getDishes();
      setDishes(data);
    };
    fetchDishes();
  }, []);

  const handleAddDish = async () => {
    await addDish(newDish);
    setDishes([...dishes, { name: newDish }]);
    setNewDish('');
  };

  return (
    <div>
      <h2>Dishes</h2>
      <ul>
        {dishes.map((dish, index) => (
          <li key={index}>{dish.name}</li>
        ))}
      </ul>
      <input
        type="text"
        placeholder="New Dish"
        value={newDish}
        onChange={(e) => setNewDish(e.target.value)}
      />
      <button onClick={handleAddDish}>Add Dish</button>
    </div>
  );
}

export default Dishes;