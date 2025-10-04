import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

const MUSIC_DIRECTORY = FileSystem.documentDirectory + 'music/';
const SONGS_KEY = '@saved_songs';
const FAVORITES_KEY = '@favorites';
const PLAYLISTS_KEY = '@playlists';

export default function App() {
  const [sound, setSound] = useState(null);
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [songToAdd, setSongToAdd] = useState(null);
  const [currentView, setCurrentView] = useState('all');

  useEffect(() => {
    setupAudio();
    loadSavedData();
  }, []);

  // Fix for time display - update continuously while playing
  useEffect(() => {
    let interval;
    if (isPlaying && sound) {
      interval = setInterval(async () => {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          setPosition(status.positionMillis);
          setDuration(status.durationMillis);
        }
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, sound]);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  };

  const loadSavedData = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(MUSIC_DIRECTORY);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MUSIC_DIRECTORY, { intermediates: true });
      }

      const savedSongsJson = await AsyncStorage.getItem(SONGS_KEY);
      if (savedSongsJson) {
        const savedSongs = JSON.parse(savedSongsJson);
        const existingSongs = [];
        for (const song of savedSongs) {
          const fileInfo = await FileSystem.getInfoAsync(song.uri);
          if (fileInfo.exists) {
            existingSongs.push(song);
          }
        }
        setSongs(existingSongs);
        if (existingSongs.length !== savedSongs.length) {
          await AsyncStorage.setItem(SONGS_KEY, JSON.stringify(existingSongs));
        }
      }

      const savedFavorites = await AsyncStorage.getItem(FAVORITES_KEY);
      if (savedFavorites) {
        setFavorites(JSON.parse(savedFavorites));
      }

      const savedPlaylists = await AsyncStorage.getItem(PLAYLISTS_KEY);
      if (savedPlaylists) {
        setPlaylists(JSON.parse(savedPlaylists));
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
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

  const saveFavorites = async (favList) => {
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favList));
      setFavorites(favList);
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  };

  const savePlaylists = async (playlistList) => {
    try {
      await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlistList));
      setPlaylists(playlistList);
    } catch (error) {
      console.error('Error saving playlists:', error);
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
        const fileName = file.name || `song_${Date.now()}.mp3`;
        const permanentUri = MUSIC_DIRECTORY + fileName;
        
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
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
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

      if (songToDelete && songToDelete.uri) {
        const fileInfo = await FileSystem.getInfoAsync(songToDelete.uri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(songToDelete.uri);
        }
      }

      const updatedSongs = songs.filter(song => song.id !== songId);
      setSongs(updatedSongs);
      await saveSongsToStorage(updatedSongs);

      const updatedFavorites = favorites.filter(id => id !== songId);
      if (updatedFavorites.length !== favorites.length) {
        await saveFavorites(updatedFavorites);
      }

      const updatedPlaylists = playlists.map(playlist => ({
        ...playlist,
        songs: playlist.songs.filter(id => id !== songId)
      }));
      await savePlaylists(updatedPlaylists);
    } catch (error) {
      console.error('Error deleting song:', error);
      Alert.alert('Error', 'Failed to delete song');
    }
  };

  const toggleFavorite = async (songId) => {
    const isFavorite = favorites.includes(songId);
    const updatedFavorites = isFavorite
      ? favorites.filter(id => id !== songId)
      : [...favorites, songId];
    await saveFavorites(updatedFavorites);
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }

    const newPlaylist = {
      id: Date.now().toString(),
      name: newPlaylistName.trim(),
      songs: []
    };

    const updatedPlaylists = [...playlists, newPlaylist];
    await savePlaylists(updatedPlaylists);
    setNewPlaylistName('');
    setShowCreatePlaylist(false);
  };

  const deletePlaylist = async (playlistId) => {
    Alert.alert(
      'Delete Playlist',
      'Are you sure you want to delete this playlist?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedPlaylists = playlists.filter(p => p.id !== playlistId);
            await savePlaylists(updatedPlaylists);
            if (selectedPlaylist?.id === playlistId) {
              setSelectedPlaylist(null);
              setCurrentView('all');
            }
          }
        }
      ]
    );
  };

  const addToPlaylist = async (playlistId) => {
    if (!songToAdd) return;

    const updatedPlaylists = playlists.map(playlist => {
      if (playlist.id === playlistId) {
        if (!playlist.songs.includes(songToAdd.id)) {
          return { ...playlist, songs: [...playlist.songs, songToAdd.id] };
        }
      }
      return playlist;
    });

    await savePlaylists(updatedPlaylists);
    setShowAddToPlaylist(false);
    setSongToAdd(null);
  };

  const formatTime = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const getDisplaySongs = () => {
    if (currentView === 'favorites') {
      return songs.filter(song => favorites.includes(song.id));
    } else if (currentView === 'playlist' && selectedPlaylist) {
      return songs.filter(song => selectedPlaylist.songs.includes(song.id));
    }
    return songs;
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
      <Text style={styles.title}>MP3 Player</Text>
      <Text style={styles.credits}>Made by Thomas Ash</Text>
      
      {isLoading ? (
        <Text style={styles.loadingText}>Loading songs...</Text>
      ) : null}

      <View style={styles.viewSelector}>
        <TouchableOpacity 
          style={[styles.viewButton, currentView === 'all' && styles.viewButtonActive]}
          onPress={() => { setCurrentView('all'); setSelectedPlaylist(null); }}
        >
          <Text style={styles.viewButtonText}>All Songs</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.viewButton, currentView === 'favorites' && styles.viewButtonActive]}
          onPress={() => { setCurrentView('favorites'); setSelectedPlaylist(null); }}
        >
          <Text style={styles.viewButtonText}>Favorites</Text>
        </TouchableOpacity>
      </View>

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

      <View style={styles.playlistHeader}>
        <TouchableOpacity 
          style={styles.createPlaylistButton}
          onPress={() => setShowCreatePlaylist(true)}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.createPlaylistText}>Create Playlist</Text>
        </TouchableOpacity>
      </View>

      {playlists.length > 0 && (
        <ScrollView horizontal style={styles.playlistScroll} showsHorizontalScrollIndicator={false}>
          {playlists.map(playlist => (
            <TouchableOpacity
              key={playlist.id}
              style={[styles.playlistChip, selectedPlaylist?.id === playlist.id && styles.playlistChipActive]}
              onPress={() => {
                setSelectedPlaylist(playlist);
                setCurrentView('playlist');
              }}
              onLongPress={() => deletePlaylist(playlist.id)}
            >
              <Text style={styles.playlistChipText}>{playlist.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={getDisplaySongs()}
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
            <View style={styles.songActions}>
              <TouchableOpacity onPress={() => toggleFavorite(item.id)}>
                <Ionicons 
                  name={favorites.includes(item.id) ? "heart" : "heart-outline"} 
                  size={24} 
                  color={favorites.includes(item.id) ? "#ff4444" : "#999"} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  setSongToAdd(item);
                  setShowAddToPlaylist(true);
                }}
                style={styles.actionButton}
              >
                <Ionicons name="add-circle-outline" size={24} color="#1DB954" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteSong(item.id)}>
                <Ionicons name="trash" size={24} color="#ff4444" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal
        visible={showCreatePlaylist}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreatePlaylist(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Playlist</Text>
            <TextInput
              style={styles.input}
              placeholder="Playlist name"
              placeholderTextColor="#666"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreatePlaylist(false);
                  setNewPlaylistName('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={createPlaylist}
              >
                <Text style={styles.modalButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddToPlaylist}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddToPlaylist(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add to Playlist</Text>
            {playlists.length === 0 ? (
              <Text style={styles.noPlaylistsText}>No playlists yet. Create one first!</Text>
            ) : (
              <ScrollView style={styles.playlistList}>
                {playlists.map(playlist => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.playlistOption}
                    onPress={() => addToPlaylist(playlist.id)}
                  >
                    <Text style={styles.playlistOptionText}>{playlist.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity 
              style={[styles.modalButton, styles.modalButtonCancel, { marginTop: 10 }]}
              onPress={() => {
                setShowAddToPlaylist(false);
                setSongToAdd(null);
              }}
            >
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    marginBottom: 15,
    fontStyle: 'italic',
  },
  loadingText: {
    color: '#999',
    textAlign: 'center',
    marginBottom: 10,
  },
  viewSelector: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 10,
  },
  viewButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#282828',
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonActive: {
    backgroundColor: '#1DB954',
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1DB954',
    padding: 15,
    borderRadius: 25,
    marginBottom: 15,
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
    marginBottom: 15,
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
  playlistHeader: {
    marginBottom: 10,
  },
  createPlaylistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    padding: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  createPlaylistText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  },
  playlistScroll: {
    maxHeight: 50,
    marginBottom: 10,
  },
  playlistChip: {
    backgroundColor: '#282828',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  playlistChipActive: {
    backgroundColor: '#1DB954',
  },
  playlistChipText: {
    color: '#fff',
    fontSize: 14,
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
  songActions: {
    flexDirection: 'row',
    gap: 15,
  },
  actionButton: {
    marginLeft: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#282828',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#121212',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#666',
  },
  modalButtonCreate: {
    backgroundColor: '#1DB954',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  noPlaylistsText: {
    color: '#999',
    textAlign: 'center',
    marginVertical: 20,
  },
  playlistList: {
    maxHeight: 200,
  },
  playlistOption: {
    padding: 15,
    backgroundColor: '#121212',
    borderRadius: 8,
    marginBottom: 8,
  },
  playlistOptionText: {
    color: '#fff',
    fontSize: 16,
  },
});