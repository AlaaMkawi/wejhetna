import React from "react";
import {
  I18nManager,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import {
  useOpeningHoursEditor,
  type OpeningHoursWeek,
} from "../../hooks/useOpeningHoursEditor";

const TEAL = "#0f5b63";

export type OpeningHoursEditorApi = ReturnType<typeof useOpeningHoursEditor>;

type Props = {
  /** When true, hours table is editable immediately (create form). */
  alwaysEditing?: boolean;
  initialHours?: string | null;
  /** Pass parent hook instance so submit can call `toStorageString()`. */
  editor?: OpeningHoursEditorApi;
};

export function PlaceOpeningHoursEditor({
  alwaysEditing = false,
  initialHours,
  editor: externalEditor,
}: Props) {
  const { t } = useTranslation();
  const internalEditor = useOpeningHoursEditor(initialHours);
  const editor = externalEditor ?? internalEditor;
  const {
    openingHours,
    setOpeningHours,
    isEditing,
    setIsEditing,
    pickerModalVisible,
    setPickerModalVisible,
    openPicker,
    handlePickerSelect,
    getPickerValue,
    getPickerOptions,
    formatPeriodLabel,
    formatHours,
    getDayName,
    isCurrentlyOpen,
  } = editor;

  const editing = alwaysEditing || isEditing;

  return (
    <View style={styles.section}>
      <View style={[styles.header, I18nManager.isRTL && styles.headerRtl]}>
        <Text style={[styles.title, I18nManager.isRTL && styles.titleRtl]}>
          {t("opening_and_closing_hours") || "שעות פתיחה וסגירה"}
        </Text>
      </View>
      <Text style={styles.optionalHint}>
        {t("optional") || "אופציונלי"}
      </Text>

      <View style={styles.hoursHeaderRow}>
        <Text style={[styles.hoursHeaderCell, styles.hoursHeaderDay]}>
          {t("day") || "יום"}
        </Text>
        <Text style={[styles.hoursHeaderCell, styles.hoursHeaderHours]}>
          {t("hours") || "שעות"}
        </Text>
        <Text style={[styles.hoursHeaderCell, styles.hoursHeaderStatus]}>
          {t("status") || "סטטוס"}
        </Text>
      </View>

      {Object.entries(openingHours).map(([day, hours]) => {
        const isOpen = hours !== null;
        const currentlyOpen = isOpen && isCurrentlyOpen(day, hours);
        return (
          <View key={day} style={styles.hoursRow}>
            <View style={styles.hoursDayCol}>
              <Text style={styles.dayText} numberOfLines={1}>
                {getDayName(day)}
              </Text>
            </View>

            {editing ? (
              <View style={styles.hoursPickerContainer}>
                {hours ? (
                  <>
                    <View style={styles.pickerRow}>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => openPicker(day, "startHour")}
                      >
                        <Text style={styles.pickerButtonText} numberOfLines={1}>
                          {hours.startHour}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={TEAL} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.pickerButtonPeriod}
                        onPress={() => openPicker(day, "startPeriod")}
                      >
                        <Text style={styles.pickerButtonText} numberOfLines={1}>
                          {formatPeriodLabel(hours.startPeriod)}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={TEAL} />
                      </TouchableOpacity>
                      <Text style={styles.pickerSeparator}>-</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => openPicker(day, "endHour")}
                      >
                        <Text style={styles.pickerButtonText} numberOfLines={1}>
                          {hours.endHour}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={TEAL} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.pickerButtonPeriod}
                        onPress={() => openPicker(day, "endPeriod")}
                      >
                        <Text style={styles.pickerButtonText} numberOfLines={1}>
                          {formatPeriodLabel(hours.endPeriod)}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={TEAL} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.removeHoursButton}
                      onPress={() =>
                        setOpeningHours({ ...openingHours, [day]: null })
                      }
                    >
                      <Text style={styles.removeHoursText}>
                        {t("remove_hours") || "הסר שעות"}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.addHoursButton}
                    onPress={() =>
                      setOpeningHours({
                        ...openingHours,
                        [day]: {
                          startHour: "08:00",
                          startPeriod: "AM",
                          endHour: "08:00",
                          endPeriod: "PM",
                        },
                      })
                    }
                  >
                    <Text style={styles.addHoursText}>
                      {t("add_hours") || "הוסף שעות"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.hoursValueCol}>
                <Text style={styles.hoursText} numberOfLines={1}>
                  {hours ? formatHours(hours) : t("closed") || "סגור"}
                </Text>
              </View>
            )}

            <View style={styles.hoursStatusCol}>
              {currentlyOpen ? (
                <View style={[styles.statusBadge, styles.statusOpen]}>
                  <Text style={styles.statusText}>
                    {t("open_now") || "פתוח עכשיו"}
                  </Text>
                </View>
              ) : isOpen ? (
                <View style={[styles.statusBadge, styles.statusClosed]}>
                  <Text style={styles.statusText}>{t("open") || "פתוח"}</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, styles.statusClosed]}>
                  <Text style={styles.statusText}>{t("closed") || "סגור"}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {!alwaysEditing && !isEditing ? (
        <TouchableOpacity
          style={styles.updateHoursButton}
          onPress={() => setIsEditing(true)}
        >
          <Text style={styles.updateHoursText}>
            {t("update_hours") || "עדכן שעות"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>
                {t("select_time") || "בחר שעה"}
              </Text>
              <TouchableOpacity onPress={() => setPickerModalVisible(false)}>
                <Ionicons name="close" size={24} color={TEAL} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerModalList}>
              {getPickerOptions().map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.pickerModalItem,
                    getPickerValue() === option && styles.pickerModalItemSelected,
                  ]}
                  onPress={() => handlePickerSelect(option)}
                >
                  <Text
                    style={[
                      styles.pickerModalItemText,
                      getPickerValue() === option &&
                        styles.pickerModalItemTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                  {getPickerValue() === option ? (
                    <Ionicons name="checkmark" size={20} color={TEAL} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { useOpeningHoursEditor, type OpeningHoursWeek };

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRtl: { flexDirection: "row-reverse" },
  title: { fontSize: 16, fontWeight: "700", color: TEAL },
  titleRtl: { textAlign: "right" },
  optionalHint: { fontSize: 12, color: "#666", marginTop: 4, marginBottom: 8 },
  hoursHeaderRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  hoursHeaderCell: { fontSize: 12, fontWeight: "600", color: "#666" },
  hoursHeaderDay: { flex: 1.1 },
  hoursHeaderHours: { flex: 2.2 },
  hoursHeaderStatus: { flex: 1, textAlign: "center" },
  hoursRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  hoursDayCol: { flex: 1.1, justifyContent: "center" },
  dayText: { fontSize: 14, fontWeight: "600", color: "#222" },
  hoursPickerContainer: { flex: 2.2 },
  hoursValueCol: { flex: 2.2, justifyContent: "center" },
  hoursText: { fontSize: 13, color: "#333" },
  hoursStatusCol: { flex: 1, alignItems: "center", justifyContent: "center" },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5fdff",
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 56,
  },
  pickerButtonPeriod: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5fdff",
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pickerButtonText: { fontSize: 12, color: TEAL, fontWeight: "600" },
  pickerSeparator: { marginHorizontal: 2, color: "#666" },
  removeHoursButton: { marginTop: 6 },
  removeHoursText: { fontSize: 12, color: "#dc3545" },
  addHoursButton: {
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d6ebee",
  },
  addHoursText: { fontSize: 13, color: TEAL, fontWeight: "600" },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusOpen: { backgroundColor: "#e8f5e9" },
  statusClosed: { backgroundColor: "#f5f5f5" },
  statusText: { fontSize: 11, fontWeight: "600", color: "#333" },
  updateHoursButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: TEAL,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  updateHoursText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "50%",
  },
  pickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  pickerModalTitle: { fontSize: 17, fontWeight: "700", color: TEAL },
  pickerModalList: { maxHeight: 320 },
  pickerModalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  pickerModalItemSelected: { backgroundColor: "#f0fafb" },
  pickerModalItemText: { fontSize: 16, color: "#333" },
  pickerModalItemTextSelected: { color: TEAL, fontWeight: "700" },
});
