import { View } from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { Sheet, ListItem } from '@shared/native';

/** Camera or gallery choice for document uploads. */
export function SourceChooser({ visible, onClose, onPick }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Add photo">
      <View className="pb-2">
        <ListItem icon={Camera} title="Take a photo" onPress={() => { onClose(); onPick('camera'); }} />
        <ListItem icon={ImageIcon} title="Choose from gallery" last onPress={() => { onClose(); onPick('gallery'); }} />
      </View>
    </Sheet>
  );
}
