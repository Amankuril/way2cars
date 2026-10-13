import { View } from '../rn';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { Sheet } from '../ui/Feedback';
import { ActionTile } from '../ui/Blocks';

/** Camera or gallery choice for document/photo uploads. */
export function SourceChooser({ visible, onClose, onPick }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Add photo">
      <View className="flex-row px-4 pb-4 pt-1">
        <View className="flex-1 px-1"><ActionTile icon={Camera} label="Take a photo" caption="Use the camera" onPress={() => { onClose(); onPick('camera'); }} /></View>
        <View className="flex-1 px-1"><ActionTile icon={ImageIcon} tone="accent" label="Choose from gallery" caption="Pick a saved photo" onPress={() => { onClose(); onPick('gallery'); }} /></View>
      </View>
    </Sheet>
  );
}
