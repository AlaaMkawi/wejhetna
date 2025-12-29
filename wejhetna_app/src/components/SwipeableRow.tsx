import React, { useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3; // 30% מהמסך
const DELETE_WIDTH = 80; // רוחב כפתור המחיקה

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  onSwipeOpen?: () => void;
  onSwipeClose?: () => void;
}

export default function SwipeableRow({
  children,
  onDelete,
  onSwipeOpen,
  onSwipeClose,
}: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);

  // עדכון הערך הנוכחי
  translateX.addListener(({ value }) => {
    currentX.current = value;
  });

  const startX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // רק אם ההזזה היא אופקית יותר מאנכית
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        startX.current = currentX.current;
      },
      onPanResponderMove: (_, gestureState) => {
        // מגביל לזוז רק שמאלה (ערכים חיוביים = שמאלה)
        // אם מושכים שמאלה, gestureState.dx חיובי, ואנחנו רוצים שהתוכן יזוז שמאלה גם כן
        const newValue = Math.max(0, startX.current + gestureState.dx);
        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalTranslate = startX.current + gestureState.dx;
        
        // אם מושך עד הסוף (יותר מ-50% מהמסך) - מוחק ישירות
        if (finalTranslate > SCREEN_WIDTH * 0.5) {
          onDelete();
          // אנימציה מהירה למחיקה
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            currentX.current = 0;
          });
        }
        // אם מושך יותר מה-threshold - פתוח לחלוטין (תציג כפתור מחק)
        else if (finalTranslate > SWIPE_THRESHOLD) {
          Animated.spring(translateX, {
            toValue: DELETE_WIDTH,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            currentX.current = DELETE_WIDTH;
            onSwipeOpen?.();
          });
        } 
        // אחרת - סגור חזרה
        else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start(() => {
            currentX.current = 0;
            onSwipeClose?.();
          });
        }
      },
    })
  ).current;

  // אנימציה של הרקע האדום שנחלק עם ההזזה
  // נשתמש ב-overflow: hidden על container ואז הרקע האדום יהיה בגודל מלא
  // רק החלק שנחשף (החלק שמתגלה כשמושכים שמאלה) יהיה נראה
  const deleteBackgroundOpacity = translateX.interpolate({
    inputRange: [0, 10],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      {/* רקע אדום שנחלק עם ההזזה - בגודל מלא, רק החלק שנחשף נראה בגלל overflow hidden */}
      <Animated.View
        style={[
          styles.deleteBackground,
          {
            opacity: deleteBackgroundOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* התוכן הנגרר */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  deleteBackground: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "#dc3545",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 16,
    zIndex: 0,
  },
  deleteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    backgroundColor: "#FFFFFF",
    zIndex: 1,
  },
});

