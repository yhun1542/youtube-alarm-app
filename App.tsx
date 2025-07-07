/**
 * YouTube Alarm App
 * 유튜브 영상을 알람으로 사용하는 앱
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get('window');

interface AlarmData {
  youtubeUrl: string;
  alarmTime: string;
  isEnabled: boolean;
}

function App(): JSX.Element {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(1);
  const [playbackStartTime, setPlaybackStartTime] = useState<Date | null>(null);
  
  const webViewRef = useRef<WebView>(null);
  const volumeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alarmCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 앱 시작 시 저장된 데이터 로드
  useEffect(() => {
    loadAlarmData();
    startAlarmCheck();
    
    return () => {
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      if (stopIntervalRef.current) clearTimeout(stopIntervalRef.current);
      if (alarmCheckIntervalRef.current) clearInterval(alarmCheckIntervalRef.current);
    };
  }, []);

  // 알람 데이터 로드
  const loadAlarmData = async () => {
    try {
      const savedData = await AsyncStorage.getItem('alarmData');
      if (savedData) {
        const data: AlarmData = JSON.parse(savedData);
        setYoutubeUrl(data.youtubeUrl || '');
        setAlarmTime(data.alarmTime || '07:00');
        setIsAlarmEnabled(data.isEnabled || false);
      }
    } catch (error) {
      console.error('알람 데이터 로드 실패:', error);
    }
  };

  // 알람 데이터 저장
  const saveAlarmData = async () => {
    try {
      const data: AlarmData = {
        youtubeUrl,
        alarmTime,
        isEnabled: isAlarmEnabled,
      };
      await AsyncStorage.setItem('alarmData', JSON.stringify(data));
      Alert.alert('저장 완료', '알람이 설정되었습니다.');
    } catch (error) {
      console.error('알람 데이터 저장 실패:', error);
      Alert.alert('오류', '알람 저장에 실패했습니다.');
    }
  };

  // YouTube URL에서 비디오 ID 추출
  const extractVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // YouTube 임베드 URL 생성
  const getEmbedUrl = (videoId: string): string => {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&rel=0&showinfo=0&modestbranding=1`;
  };

  // 알람 시간 체크
  const startAlarmCheck = () => {
    alarmCheckIntervalRef.current = setInterval(() => {
      if (!isAlarmEnabled) return;

      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      if (currentTime === alarmTime && !isPlaying) {
        triggerAlarm();
      }
    }, 1000); // 1초마다 체크
  };

  // 알람 실행
  const triggerAlarm = () => {
    if (!youtubeUrl) {
      Alert.alert('오류', 'YouTube URL을 설정해주세요.');
      return;
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      Alert.alert('오류', '올바른 YouTube URL을 입력해주세요.');
      return;
    }

    setIsPlaying(true);
    setCurrentVolume(1);
    setPlaybackStartTime(new Date());
    
    // 볼륨 점진적 증가 (30초마다)
    startVolumeIncrease();
    
    // 10분 후 자동 정지
    stopIntervalRef.current = setTimeout(() => {
      stopAlarm();
    }, 10 * 60 * 1000); // 10분
  };

  // 볼륨 점진적 증가
  const startVolumeIncrease = () => {
    volumeIntervalRef.current = setInterval(() => {
      setCurrentVolume(prev => {
        const newVolume = Math.min(prev + 1, 8);
        // WebView에 볼륨 변경 메시지 전송
        if (webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify({
            action: 'setVolume',
            volume: newVolume / 8 // 0-1 범위로 변환
          }));
        }
        return newVolume;
      });
    }, 30000); // 30초마다
  };

  // 알람 정지
  const stopAlarm = () => {
    setIsPlaying(false);
    setCurrentVolume(1);
    setPlaybackStartTime(null);
    
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    
    if (stopIntervalRef.current) {
      clearTimeout(stopIntervalRef.current);
      stopIntervalRef.current = null;
    }

    // WebView에 정지 메시지 전송
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        action: 'stop'
      }));
    }
  };

  // 수동 테스트 재생
  const testPlayback = () => {
    if (!youtubeUrl) {
      Alert.alert('오류', 'YouTube URL을 설정해주세요.');
      return;
    }
    triggerAlarm();
  };

  // WebView 메시지 처리
  const handleWebViewMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      console.log('WebView 메시지:', message);
    } catch (error) {
      console.error('WebView 메시지 파싱 오류:', error);
    }
  };

  const videoId = extractVideoId(youtubeUrl);
  const embedUrl = videoId ? getEmbedUrl(videoId) : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>YouTube Alarm</Text>
          <Text style={styles.subtitle}>유튜브 영상으로 알람 설정하기</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YouTube URL</Text>
          <TextInput
            style={styles.input}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor="#999"
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>알람 시간</Text>
          <TextInput
            style={styles.timeInput}
            value={alarmTime}
            onChangeText={setAlarmTime}
            placeholder="07:00"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.switchContainer}>
            <Text style={styles.sectionTitle}>알람 활성화</Text>
            <Switch
              value={isAlarmEnabled}
              onValueChange={setIsAlarmEnabled}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isAlarmEnabled ? '#f5dd4b' : '#f4f3f4'}
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.saveButton} onPress={saveAlarmData}>
            <Text style={styles.buttonText}>알람 저장</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.testButton} onPress={testPlayback}>
            <Text style={styles.buttonText}>테스트 재생</Text>
          </TouchableOpacity>
          
          {isPlaying && (
            <TouchableOpacity style={styles.stopButton} onPress={stopAlarm}>
              <Text style={styles.buttonText}>정지</Text>
            </TouchableOpacity>
          )}
        </View>

        {isPlaying && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>🎵 재생 중...</Text>
            <Text style={styles.volumeText}>볼륨: {currentVolume}/8</Text>
            {playbackStartTime && (
              <Text style={styles.timeText}>
                시작 시간: {playbackStartTime.toLocaleTimeString()}
              </Text>
            )}
          </View>
        )}

        {isPlaying && embedUrl && (
          <View style={styles.webViewContainer}>
            <WebView
              ref={webViewRef}
              source={{ uri: embedUrl }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              onMessage={handleWebViewMessage}
              injectedJavaScript={`
                // 볼륨 제어를 위한 JavaScript
                window.addEventListener('message', function(event) {
                  try {
                    const data = JSON.parse(event.data);
                    if (data.action === 'setVolume') {
                      // YouTube iframe API를 통한 볼륨 제어
                      if (window.YT && window.YT.get) {
                        const player = window.YT.get('player');
                        if (player && player.setVolume) {
                          player.setVolume(data.volume * 100);
                        }
                      }
                    } else if (data.action === 'stop') {
                      if (window.YT && window.YT.get) {
                        const player = window.YT.get('player');
                        if (player && player.pauseVideo) {
                          player.pauseVideo();
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Message handling error:', error);
                  }
                });
                true;
              `}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    minHeight: 50,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: '#f9f9f9',
    textAlign: 'center',
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonContainer: {
    padding: 20,
    gap: 10,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  volumeText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  timeText: {
    fontSize: 14,
    color: '#999',
  },
  webViewContainer: {
    margin: 10,
    height: 200,
    borderRadius: 10,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
  },
});

export default App;

