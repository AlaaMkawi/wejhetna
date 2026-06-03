import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { placeDetailsManageActionStyles as styles } from "./placeDetailsManageActionStyles";

export type PlaceDetailsManageActionsProps = {
  showEdit?: boolean;
  showDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  deleteLoading?: boolean;
  /** Optional note when management actions are unavailable (e.g. admin + owned place). */
  infoMessage?: string | null;
};

/**
 * Small edit/delete footer for place details bottom sheets.
 * Shown at the bottom of the sheet — separate from primary nav/ride CTAs.
 */
export function PlaceDetailsManageActions({
  showEdit = false,
  showDelete = false,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  deleteLoading = false,
  infoMessage,
}: PlaceDetailsManageActionsProps) {
  const { t } = useTranslation();

  const hasActions = showEdit || showDelete;
  if (!hasActions && !infoMessage) {
    return null;
  }

  const editText = editLabel ?? t("edit_place_details") ?? "ערוך פרטי מקום";
  const deleteText = deleteLabel ?? t("delete_place") ?? "מחק מקום";

  return (
    <View style={styles.block}>
      {hasActions ? (
        <View style={styles.row}>
          {showEdit && onEdit ? (
            <TouchableOpacity
              style={[styles.buttonBase, styles.editButton]}
              onPress={onEdit}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={16} color="#0f5b63" />
              <Text style={styles.editButtonText} numberOfLines={2}>
                {editText}
              </Text>
            </TouchableOpacity>
          ) : null}
          {showDelete && onDelete ? (
            <TouchableOpacity
              style={[
                styles.buttonBase,
                styles.deleteButton,
                deleteLoading && styles.buttonDisabled,
              ]}
              onPress={onDelete}
              disabled={deleteLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {deleteLoading ? (
                <ActivityIndicator size="small" color="#DC3545" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#DC3545" />
                  <Text style={styles.deleteButtonText} numberOfLines={2}>
                    {deleteText}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {infoMessage ? (
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#0f5b63" />
          <Text style={styles.infoBannerText}>{infoMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}
