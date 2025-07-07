/**
 * YouTube Alarm App
 * 유튜브 영상을 알람으로 사용하는 앱 (백그라운드 알람 지원)
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
  AppState,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import PushNotification from 'react-native-push-notification';

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

  // 푸시 알림 초기화
  useEffect(() => {
    PushNotification.configure({
      onNotification: function(notification) {
        console.log('알림 수신:', notification);
        
        if (notification.userInteraction) {
          // 사용자가 알림을 탭했을 때
          handleAlarmTrigger();
        }
      },
      requestPermissions: Platform.OS === 'ios',
    });

    // 기존 알림 모두 취소
    PushNotification.cancelAllLocalNotifications();
    
    loadAlarmData();
    startAlarmCheck();
    
    return () => {
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      if (stopIntervalRef.current) clearInterval(stopIntervalRef.current);
      if (alarmCheckIntervalRef.current) clearInterval(alarmCheckIntervalRef.current);
    };
  }, []);

  // 앱 상태 변화 감지
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' && isAlarmEnabled) {
        scheduleLocalNotification();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isAlarmEnabled, alarmTime]);

  // 로컬 알림 스케줄링
  const scheduleLocalNotification = () => {
    if (!isAlarmEnabled || !alarmTime) return;

    const [hours, minutes] = alarmTime.split(':').map(Number);
    const now = new Date();
    const alarmDate = new Date();
    alarmDate.setHours(hours, minutes, 0, 0);

    // 알람 시간이 현재 시간보다 이전이면 다음 날로 설정
    if (alarmDate <= now) {
      alarmDate.setDate(alarmDate.getDate() + 1);
    }

    // 기존 알림 취소
    PushNotification.cancelAllLocalNotifications();

    // 새 알림 스케줄
    PushNotification.localNotificationSchedule({
      title: "YouTube Alarm",
      message: "알람 시간입니다! 탭해서 음악을 재생하세요.",
      date: alarmDate,
      soundName: 'default',
      vibrate: true,
      vibration: 300,
      playSound: true,
      importance: 'high',
      priority: 'high',
      allowWhileIdle: true,
      ignoreInForeground: false,
    });

    console.log(`알람이 ${alarmDate.toLocaleString()}에 설정되었습니다.`);
  };

  // 알람 트리거 처리
  const handleAlarmTrigger = () => {
    if (!youtubeUrl) {
      Alert.alert('오류', 'YouTube URL이 설정되지 않았습니다.');
      return;
    }

    setIsPlaying(true);
    setCurrentVolume(1);
    setPlaybackStartTime(new Date());
    
    // 볼륨 점진적 증가
    startVolumeIncrease();
    
    // 10분 후 자동 정지
    stopIntervalRef.current = setTimeout(() => {
      stopAlarm();
    }, 10 * 60 * 1000);
  };

  // 저장된 알람 데이터 로드
  const loadAlarmData = async () => {
    try {
      const savedData = await AsyncStorage.getItem('alarmData');
      if (savedData) {
        const data: AlarmData = JSON.parse(savedData);
        setYoutubeUrl(data.youtubeUrl);
        setAlarmTime(data.alarmTime);
        setIsAlarmEnabled(data.isEnabled);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
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
      
      if (isAlarmEnabled) {
        scheduleLocalNotification();
        Alert.alert('알람 저장됨', `${alarmTime}에 알람이 설정되었습니다.\n앱이 백그라운드에 있어도 알림이 표시됩니다.`);
      } else {
        PushNotification.cancelAllLocalNotifications();
        Alert.alert('알람 해제됨', '알람이 해제되었습니다.');
      }
    } catch (error) {
      console.error('데이터 저장 실패:', error);
      Alert.alert('오류', '알람 저장에 실패했습니다.');
    }
  };

  // 알람 시간 체크 (포그라운드용)
  const startAlarmCheck = () => {
    alarmCheckIntervalRef.current = setInterval(() => {
      if (!isAlarmEnabled) return;

      const now = new Date();
      const [hours, minutes] = alarmTime.split(':').map(Number);
      
      if (now.getHours() === hours && now.getMinutes() === minutes && now.getSeconds() === 0) {
        handleAlarmTrigger();
      }
    }, 1000);
  };

  // 볼륨 점진적 증가
  const startVolumeIncrease = () => {
    let volume = 1;
    volumeIntervalRef.current = setInterval(() => {
      if (volume < 8) {
        volume++;
        setCurrentVolume(volume);
        
        // WebView에 볼륨 조절 명령 전송
        const volumeLevel = volume / 8; // 0.125 ~ 1.0
        webViewRef.current?.postMessage(JSON.stringify({
          action: 'setVolume',
          volume: volumeLevel
        }));
      } else {
        if (volumeIntervalRef.current) {
          clearInterval(volumeIntervalRef.current);
        }
      }
    }, 30000); // 30초마다 볼륨 증가
  };

  // 알람 정지
  const stopAlarm = () => {
    setIsPlaying(false);
    setCurrentVolume(1);
    setPlaybackStartTime(null);
    
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
    }
    if (stopIntervalRef.current) {
      clearTimeout(stopIntervalRef.current);
    }
    
    // WebView 정지
    webViewRef.current?.postMessage(JSON.stringify({
      action: 'stop'
    }));
  };

  // 테스트 재생
  const testPlay = () => {
    if (!youtubeUrl) {
      Alert.alert('오류', 'YouTube URL을 먼저 입력해주세요.');
      return;
    }
    
    handleAlarmTrigger();
  };

  // YouTube URL에서 비디오 ID 추출
  const getYouTubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // YouTube 임베드 HTML 생성
  const getYouTubeEmbedHtml = (videoId: string): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { margin: 0; padding: 0; background: black; }
            #player { width: 100%; height: 100vh; }
        </style>
    </head>
    <body>
        <div id="player"></div>
        <script>
            var tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
            var player;
            function onYouTubeIframeAPIReady() {
                player = new YT.Player('player', {
                    height: '100%',
                    width: '100%',
                    videoId: '${videoId}',
                    playerVars: {
                        'autoplay': 0,
                        'controls': 1,
                        'rel': 0,
                        'showinfo': 0,
                        'modestbranding': 1
                    },
                    events: {
                        'onReady': onPlayerReady
                    }
                });
            }
            
            function onPlayerReady(event) {
                // 메시지 리스너 설정
                window.addEventListener('message', function(event) {
                    try {
                        var data = JSON.parse(event.data);
                        if (data.action === 'play') {
                            player.playVideo();
                            player.setVolume(12.5); // 초기 볼륨 1/8
                        } else if (data.action === 'stop') {
                            player.stopVideo();
                        } else if (data.action === 'setVolume') {
                            player.setVolume(data.volume * 100);
                        }
                    } catch (e) {
                        console.log('메시지 파싱 오류:', e);
                    }
                });
            }
        </script>
    </body>
    </html>
    `;
  };

  const videoId = getYouTubeVideoId(youtubeUrl);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>YouTube Alarm</Text>
          <Text style={styles.subtitle}>좋아하는 유튜브 영상으로 기상하세요</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YouTube URL</Text>
          <TextInput
            style={styles.input}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>알람 시간</Text>
          <TextInput
            style={styles.input}
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
          <TouchableOpacity style={styles.button} onPress={saveAlarmData}>
            <Text style={styles.buttonText}>알람 저장</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.button, styles.testButton]} onPress={testPlay}>
            <Text style={styles.buttonText}>테스트 재생</Text>
          </TouchableOpacity>
          
          {isPlaying && (
            <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopAlarm}>
              <Text style={styles.buttonText}>정지</Text>
            </TouchableOpacity>
          )}
        </View>

        {isPlaying && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>재생 중... 볼륨: {currentVolume}/8</Text>
            {playbackStartTime && (
              <Text style={styles.statusText}>
                시작 시간: {playbackStartTime.toLocaleTimeString()}
              </Text>
            )}
          </View>
        )}

        {isPlaying && videoId && (
          <View style={styles.videoContainer}>
            <WebView
              ref={webViewRef}
              source={{ html: getYouTubeEmbedHtml(videoId) }}
              style={styles.webview}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              onLoadEnd={() => {
                // 로드 완료 후 자동 재생
                setTimeout(() => {
                  webViewRef.current?.postMessage(JSON.stringify({
                    action: 'play'
                  }));
                }, 1000);
              }}
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
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
    backgroundColor: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonContainer: {
    padding: 20,
    gap: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    padding: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  videoContainer: {
    height: 250,
    margin: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
  },
});

export default App;

