import React, { useState, useEffect } from 'react';
import { getMovies, addMovie } from '../utils/api';

function Movies() {
  const [movies, setMovies] = useState([]);
  const [newMovie, setNewMovie] = useState('');

  useEffect(() => {
    const fetchMovies = async () => {
      const data = await getMovies();
      setMovies(data);
    };
    fetchMovies();
  }, []);

  const handleAddMovie = async () => {
    await addMovie(newMovie);
    setMovies([...movies, { name: newMovie }]);
    setNewMovie('');
  };

  return (
    <div>
      <h2>Movies</h2>
      <ul>
        {movies.map((movie, index) => (
          <li key={index}>{movie.name}</li>
        ))}
      </ul>
      <input
        type="text"
        placeholder="New Movie"
        value={newMovie}
        onChange={(e) => setNewMovie(e.target.value)}
      />
      <button onClick={handleAddMovie}>Add Movie</button>
    </div>
  );
}

export default Movies;