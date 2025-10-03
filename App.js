import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';

export default function App() {
  const [sound, setSound] = useState(null);
  const [songs, setSongs] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);

  // Set up audio mode when app loads
  useEffect(() => {
    async function setupAudio() {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      } catch (error) {
        console.error('Error setting up audio:', error);
      }
    }
    setupAudio();

    // Cleanup on unmount
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  async function pickSongs() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      
      console.log('Picker result:', result);
      
      if (!result.canceled && result.assets) {
        setSongs([...songs, ...result.assets]);
        Alert.alert('Success', `Added ${result.assets.length} song(s)`);
      }
    } catch (err) {
      console.error('Error picking file:', err);
      Alert.alert('Error', 'Failed to pick audio file');
    }
  }

  async function playSound(song) {
    try {
      console.log('Attempting to play:', song.uri);
      
      // Unload previous sound
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Load and play new sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );
      
      setSound(newSound);
      setPlaying(true);
      setCurrentSong(song);
      Alert.alert('Now Playing', song.name);
    } catch (err) {
      console.error('Error playing sound:', err);
      Alert.alert('Error', 'Failed to play audio file. Make sure it\'s a valid MP3.');
    }
  }

  function onPlaybackStatusUpdate(status) {
    if (status.didJustFinish) {
      setPlaying(false);
    }
  }

  async function pauseSound() {
    if (sound) {
      await sound.pauseAsync();
      setPlaying(false);
    }
  }

  async function resumeSound() {
    if (sound) {
      await sound.playAsync();
      setPlaying(true);
    }
  }

  async function stopSound() {
    if (sound) {
      await sound.stopAsync();
      setPlaying(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎵 MP3 Player</Text>
        <TouchableOpacity style={styles.addButton} onPress={pickSongs}>
          <Text style={styles.addButtonText}>+ Add Songs</Text>
        </TouchableOpacity>
      </View>

      {songs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyTitle}>No Songs Yet</Text>
          <Text style={styles.emptySubtitle}>Tap the button above to add MP3 files</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={pickSongs}>
            <Text style={styles.emptyButtonText}>Add Your First Song</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.songItem,
                currentSong?.uri === item.uri && styles.songItemActive
              ]}
              onPress={() => playSound(item)}
            >
              <View style={styles.songIcon}>
                <Text style={styles.songIconText}>🎵</Text>
              </View>
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.songArtist}>
                  {(item.size / 1024 / 1024).toFixed(2)} MB
                </Text>
              </View>
              {currentSong?.uri === item.uri && playing && (
                <Text style={styles.playingIndicator}>▶</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {currentSong && (
        <View style={styles.playerControls}>
          <Text style={styles.nowPlaying} numberOfLines={1}>
            {currentSong.name}
          </Text>
          <View style={styles.controlButtons}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={stopSound}
            >
              <Text style={styles.controlButtonText}>⏹ Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.playButton}
              onPress={playing ? pauseSound : resumeSound}
            >
              <Text style={styles.playButtonText}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  songItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  songItemActive: {
    backgroundColor: '#f0f8ff',
  },
  songIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  songIconText: {
    fontSize: 20,
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 14,
    color: '#666',
  },
  playingIndicator: {
    fontSize: 20,
    color: '#007AFF',
  },
  playerControls: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  nowPlaying: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  controlButton: {
    backgroundColor: '#666',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});