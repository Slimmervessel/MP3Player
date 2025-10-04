import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

const MUSIC_DIRECTORY = FileSystem.documentDirectory + 'music/';
const SONGS_KEY = '@saved_songs';

export default function App() {
  const [sound, setSound] = useState(null);
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setupAudio();
    loadSavedSongs();
  }, []);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  };

  const loadSavedSongs = async () => {
    try {
      // Create music directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(MUSIC_DIRECTORY);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MUSIC_DIRECTORY, { intermediates: true });
      }

      // Load saved songs list from AsyncStorage
      const savedSongsJson = await AsyncStorage.getItem(SONGS_KEY);
      if (savedSongsJson) {
        const savedSongs = JSON.parse(savedSongsJson);
        
        // Verify files still exist
        const existingSongs = [];
        for (const song of savedSongs) {
          const fileInfo = await FileSystem.getInfoAsync(song.uri);
          if (fileInfo.exists) {
            existingSongs.push(song);
          }
        }
        
        setSongs(existingSongs);
        if (existingSongs.length !== savedSongs.length) {
          // Update storage if some files were missing
          await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(existingSongs));
        }
      }
    } catch (error) {
      console.error('Error loading saved songs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSongsToStorage = async (songsList) => {
    try {
      await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(songsList));
    } catch (error) {
      console.error('Error saving songs:', error);
    }
  };

  const pickSong = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        // Create permanent file path
        const fileName = file.name || `song_${Date.now()}.mp3`;
        const permanentUri = MUSIC_DIRECTORY + fileName;
        
        // Copy file to permanent storage
        await FileSystem.copyAsync({
          from: file.uri,
          to: permanentUri,
        });

        const newSong = {
          id: Date.now().toString(),
          name: fileName,
          uri: permanentUri,
        };

        const updatedSongs = [...songs, newSong];
        setSongs(updatedSongs);
        await saveSongsToStorage(updatedSongs);
        
        Alert.alert('Success', 'Song added successfully!');
      }
    } catch (error) {
      console.error('Error picking song:', error);
      Alert.alert('Error', 'Failed to add song');
    }
  };

  const playSong = async (song) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrentSong(song);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing song:', error);
      Alert.alert('Error', 'Failed to play song');
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis);
      setIsPlaying(status.isPlaying);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const togglePlayPause = async () => {
    if (!sound) return;

    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
  };

  const stopSound = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
      setCurrentSong(null);
      setIsPlaying(false);
      setPosition(0);
      setDuration(0);
    }
  };

  const seekTo = async (value) => {
    if (sound) {
      await sound.setPositionAsync(value);
    }
  };

  const deleteSong = async (songId) => {
    try {
      const songToDelete = songs.find(s => s.id === songId);
      
      if (currentSong?.id === songId) {
        await stopSound();
      }

      // Delete the file from storage
      if (songToDelete && songToDelete.uri) {
        const fileInfo = await FileSystem.getInfoAsync(songToDelete.uri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(songToDelete.uri);
        }
      }

      const updatedSongs = songs.filter(song => song.id !== songId);
      setSongs(updatedSongs);
      await saveSongsToStorage(updatedSongs);
    } catch (error) {
      console.error('Error deleting song:', error);
      Alert.alert('Error', 'Failed to delete song');
    }
  };

  const formatTime = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  return (
    <View style={styles.container}>
      <View style={styles.container}>
        <Text style={styles.title}>MP3 Player</Text>
        <Text style={styles.credits}>Made by Thomas Ash</Text>
        
        {isLoading ? (
          <Text style={styles.loadingText}>Loading songs...</Text>
        ) : null}

        <TouchableOpacity style={styles.addButton} onPress={pickSong}>
          <Ionicons name="add-circle" size={24} color="white" />
          <Text style={styles.addButtonText}>Add Song</Text>
        </TouchableOpacity>

        {currentSong && (
          <View style={styles.nowPlaying}>
            <Text style={styles.nowPlayingText}>Now Playing:</Text>
            <Text style={styles.songTitle}>{currentSong.name}</Text>
            <Text style={styles.watermark}>© Thomas Ash</Text>

            <View style={styles.progressContainer}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                value={position}
                onSlidingComplete={seekTo}
                minimumTrackTintColor="#1DB954"
                maximumTrackTintColor="#666"
                thumbTintColor="#1DB954"
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity onPress={stopSound} style={styles.controlButton}>
                <Ionicons name="stop" size={32} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePlayPause} style={styles.controlButton}>
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={48} 
                  color="white" 
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          style={styles.songList}
          renderItem={({ item }) => (
            <View style={styles.songItem}>
              <TouchableOpacity 
                style={styles.songInfo}
                onPress={() => playSong(item)}
              >
                <Ionicons name="musical-note" size={24} color="#1DB954" />
                <Text style={styles.songName}>{item.name}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteSong(item.id)}>
                <Ionicons name="trash" size={24} color="#ff4444" />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#fff',
  },
  credits: {
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  loadingText: {
    color: '#999',
    textAlign: 'center',
    marginBottom: 10,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1DB954',
    padding: 15,
    borderRadius: 25,
    marginBottom: 20,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  nowPlaying: {
    backgroundColor: '#282828',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  nowPlayingText: {
    color: '#999',
    fontSize: 12,
    marginBottom: 5,
  },
  songTitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 5,
  },
  watermark: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  controlButton: {
    marginHorizontal: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  slider: {
    flex: 1,
    marginHorizontal: 10,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
  },
  songList: {
    flex: 1,
  },
  songItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#282828',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  songInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  songName: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
    flex: 1,
  },
});