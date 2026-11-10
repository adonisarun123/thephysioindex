/**
 * HEP-01 starter library: common home exercises, text only, written by the
 * editorial team. A physiotherapist chooses and doses them for a patient; the
 * patient page always says to follow the physiotherapist's advice. Codes are
 * stable keys — never reuse a code for a different exercise.
 */
export type SeedExercise = {
  code: string;
  name: string;
  bodyRegion: "neck" | "shoulder" | "elbow_wrist" | "back" | "hip" | "knee" | "ankle_foot" | "core" | "balance" | "general";
  instructions: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  frequency?: string;
};

export const EXERCISE_LIBRARY: SeedExercise[] = [
  // Neck
  { code: "neck-chin-tuck", name: "Chin tucks", bodyRegion: "neck", sets: 2, reps: 10, holdSeconds: 5, frequency: "Twice a day",
    instructions: "Sit or stand tall, looking straight ahead. Gently draw your chin straight back, as if making a double chin, without tilting your head down. Hold, then relax." },
  { code: "neck-side-bend", name: "Neck side bend stretch", bodyRegion: "neck", sets: 1, reps: 3, holdSeconds: 20, frequency: "Twice a day",
    instructions: "Sit tall with shoulders relaxed. Slowly tilt your ear towards your shoulder until you feel a gentle stretch on the opposite side. Hold, return to centre and repeat on the other side." },
  { code: "neck-rotation", name: "Neck rotation", bodyRegion: "neck", sets: 1, reps: 10, frequency: "Twice a day",
    instructions: "Sit tall. Slowly turn your head to look over one shoulder as far as is comfortable, return to centre, then turn to the other side. Move smoothly; do not force the end of the range." },
  { code: "neck-scapular-squeeze", name: "Shoulder blade squeeze", bodyRegion: "neck", sets: 2, reps: 10, holdSeconds: 5, frequency: "Twice a day",
    instructions: "Sit or stand tall with arms by your sides. Squeeze your shoulder blades back and down, without shrugging. Hold, then relax." },

  // Shoulder
  { code: "shoulder-pendulum", name: "Pendulum swings", bodyRegion: "shoulder", sets: 2, reps: 10, frequency: "Three times a day",
    instructions: "Lean forward with your good hand on a table. Let the affected arm hang down loosely. Gently swing it forwards and back, side to side, then in small circles, using your body to start the movement." },
  { code: "shoulder-wall-slide", name: "Wall finger walk", bodyRegion: "shoulder", sets: 2, reps: 10, frequency: "Twice a day",
    instructions: "Stand facing a wall at arm's length. Walk your fingers up the wall as high as is comfortable, hold briefly, then walk them back down. Keep your shoulder relaxed." },
  { code: "shoulder-towel-stretch", name: "Towel stretch behind back", bodyRegion: "shoulder", sets: 1, reps: 5, holdSeconds: 15, frequency: "Twice a day",
    instructions: "Hold a towel over one shoulder with the top hand and grip the lower end with the other hand behind your back. Gently pull the towel upwards with the top hand to lift the lower arm. Hold, then relax." },
  { code: "shoulder-er-band", name: "External rotation with band", bodyRegion: "shoulder", sets: 3, reps: 10, frequency: "Once a day",
    instructions: "Stand with your elbow bent to 90 degrees and tucked against your side, holding an exercise band anchored at waist height. Rotate your forearm outwards away from your body, keeping the elbow at your side. Return slowly." },
  { code: "shoulder-isometric-flexion", name: "Isometric shoulder press", bodyRegion: "shoulder", sets: 1, reps: 10, holdSeconds: 5, frequency: "Twice a day",
    instructions: "Stand facing a wall with your fist against it, elbow bent. Push gently forwards into the wall without moving the arm. Hold, then relax. Use light effort only." },

  // Elbow / wrist
  { code: "wrist-extensor-stretch", name: "Wrist extensor stretch", bodyRegion: "elbow_wrist", sets: 1, reps: 3, holdSeconds: 20, frequency: "Three times a day",
    instructions: "Hold your arm straight in front of you, palm down. With the other hand, gently bend the wrist downwards until you feel a stretch on the top of the forearm. Hold." },
  { code: "wrist-flexor-stretch", name: "Wrist flexor stretch", bodyRegion: "elbow_wrist", sets: 1, reps: 3, holdSeconds: 20, frequency: "Three times a day",
    instructions: "Hold your arm straight in front of you, palm up. With the other hand, gently bend the wrist downwards until you feel a stretch on the underside of the forearm. Hold." },
  { code: "grip-squeeze", name: "Grip squeeze", bodyRegion: "elbow_wrist", sets: 2, reps: 10, holdSeconds: 3, frequency: "Twice a day",
    instructions: "Squeeze a soft ball or rolled towel firmly, hold, then relax your hand completely." },

  // Back
  { code: "back-knee-to-chest", name: "Knee to chest stretch", bodyRegion: "back", sets: 1, reps: 5, holdSeconds: 20, frequency: "Twice a day",
    instructions: "Lie on your back with knees bent. Bring one knee towards your chest, holding behind the thigh, until you feel a gentle stretch in the lower back. Hold, lower, and repeat with the other leg." },
  { code: "back-pelvic-tilt", name: "Pelvic tilt", bodyRegion: "back", sets: 2, reps: 10, holdSeconds: 5, frequency: "Twice a day",
    instructions: "Lie on your back with knees bent and feet flat. Gently flatten your lower back into the floor by tightening your stomach muscles and tilting your pelvis. Hold, then relax." },
  { code: "back-cat-camel", name: "Cat and camel", bodyRegion: "back", sets: 1, reps: 10, frequency: "Twice a day",
    instructions: "Kneel on hands and knees. Slowly round your back up towards the ceiling, then let it gently sag down while lifting your head slightly. Move within a comfortable range." },
  { code: "back-prone-press-up", name: "Prone press-up", bodyRegion: "back", sets: 1, reps: 10, frequency: "As advised by your physiotherapist",
    instructions: "Lie face down with hands under your shoulders. Keeping your hips on the floor, slowly straighten your arms to lift your upper body, letting your lower back relax. Lower slowly." },
  { code: "back-lumbar-rotation", name: "Lower back rotation", bodyRegion: "back", sets: 1, reps: 10, frequency: "Twice a day",
    instructions: "Lie on your back with knees bent and together. Slowly let both knees fall to one side as far as is comfortable, return to centre, then to the other side. Keep your shoulders on the floor." },
  { code: "back-bird-dog", name: "Bird dog", bodyRegion: "back", sets: 2, reps: 8, holdSeconds: 5, frequency: "Once a day",
    instructions: "Kneel on hands and knees with a flat back. Slowly reach one arm forward and the opposite leg back, keeping your hips level. Hold, return, and switch sides." },

  // Core
  { code: "core-bridge", name: "Bridge", bodyRegion: "core", sets: 2, reps: 10, holdSeconds: 3, frequency: "Once a day",
    instructions: "Lie on your back with knees bent and feet hip-width apart. Squeeze your buttocks and lift your hips until your body forms a straight line from shoulders to knees. Hold, then lower slowly." },
  { code: "core-dead-bug", name: "Dead bug", bodyRegion: "core", sets: 2, reps: 8, frequency: "Once a day",
    instructions: "Lie on your back with arms pointing up and hips and knees bent to 90 degrees. Keeping your lower back gently pressed down, slowly lower one arm and the opposite leg towards the floor, then return and switch." },
  { code: "core-side-plank-knees", name: "Side plank on knees", bodyRegion: "core", sets: 2, reps: 3, holdSeconds: 15, frequency: "Once a day",
    instructions: "Lie on your side with knees bent and elbow under your shoulder. Lift your hips so your body is straight from head to knees. Hold, lower, and repeat on the other side." },

  // Hip
  { code: "hip-clamshell", name: "Clamshell", bodyRegion: "hip", sets: 2, reps: 12, frequency: "Once a day",
    instructions: "Lie on your side with hips and knees bent and feet together. Keeping your feet touching, lift the top knee as far as you can without rolling your pelvis back. Lower slowly." },
  { code: "hip-flexor-stretch", name: "Kneeling hip flexor stretch", bodyRegion: "hip", sets: 1, reps: 3, holdSeconds: 20, frequency: "Twice a day",
    instructions: "Kneel on one knee with the other foot flat in front. Keep your back upright and gently shift your weight forwards until you feel a stretch at the front of the hip of the kneeling leg. Hold, then switch sides." },
  { code: "hip-piriformis-stretch", name: "Piriformis stretch", bodyRegion: "hip", sets: 1, reps: 3, holdSeconds: 20, frequency: "Twice a day",
    instructions: "Lie on your back with knees bent. Cross one ankle over the opposite knee, then pull the uncrossed thigh gently towards your chest until you feel a stretch in the buttock. Hold, then switch sides." },
  { code: "hip-side-lying-abduction", name: "Side-lying leg raise", bodyRegion: "hip", sets: 2, reps: 10, frequency: "Once a day",
    instructions: "Lie on your side with the bottom knee bent for support. Keep the top leg straight and slightly behind you, and lift it towards the ceiling. Lower slowly." },

  // Knee
  { code: "knee-quad-set", name: "Static quadriceps", bodyRegion: "knee", sets: 2, reps: 10, holdSeconds: 5, frequency: "Three times a day",
    instructions: "Sit or lie with your leg straight and a rolled towel under the knee. Tighten the thigh muscle to press the back of the knee into the towel. Hold, then relax." },
  { code: "knee-straight-leg-raise", name: "Straight leg raise", bodyRegion: "knee", sets: 2, reps: 10, frequency: "Twice a day",
    instructions: "Lie on your back with one knee bent and the other leg straight. Tighten the thigh of the straight leg and lift it to the height of the bent knee. Hold briefly and lower slowly." },
  { code: "knee-heel-slide", name: "Heel slides", bodyRegion: "knee", sets: 2, reps: 10, frequency: "Twice a day",
    instructions: "Lie on your back with legs straight. Slowly slide one heel towards your buttock, bending the knee as far as is comfortable, then slide it back." },
  { code: "knee-sit-to-stand", name: "Sit to stand", bodyRegion: "knee", sets: 2, reps: 10, frequency: "Once a day",
    instructions: "Sit on a firm chair with feet flat. Lean slightly forward and stand up without using your hands if you can, then sit back down slowly and with control." },
  { code: "knee-terminal-extension", name: "Short arc quadriceps", bodyRegion: "knee", sets: 2, reps: 10, holdSeconds: 3, frequency: "Twice a day",
    instructions: "Lie on your back with a rolled towel or pillow under the knee. Straighten the knee by lifting the heel, keeping the back of the knee on the roll. Hold, then lower slowly." },
  { code: "knee-hamstring-stretch", name: "Seated hamstring stretch", bodyRegion: "knee", sets: 1, reps: 3, holdSeconds: 20, frequency: "Twice a day",
    instructions: "Sit on the edge of a chair with one leg straight in front, heel on the floor. Keeping your back straight, lean forward from the hips until you feel a stretch behind the thigh. Hold." },

  // Ankle / foot
  { code: "ankle-pumps", name: "Ankle pumps", bodyRegion: "ankle_foot", sets: 2, reps: 15, frequency: "Three times a day",
    instructions: "Sit or lie with your legs straight. Point your toes away from you, then pull them back towards you. Move smoothly through the full range." },
  { code: "ankle-alphabet", name: "Ankle alphabet", bodyRegion: "ankle_foot", sets: 1, reps: 1, frequency: "Twice a day",
    instructions: "Sit with your leg supported and foot free. Trace the letters of the alphabet in the air with your big toe, moving only at the ankle." },
  { code: "ankle-calf-raise", name: "Calf raises", bodyRegion: "ankle_foot", sets: 2, reps: 12, frequency: "Once a day",
    instructions: "Stand holding a counter for balance. Rise up onto your toes as high as you can, then lower slowly." },
  { code: "ankle-calf-stretch", name: "Calf stretch against wall", bodyRegion: "ankle_foot", sets: 1, reps: 3, holdSeconds: 30, frequency: "Twice a day",
    instructions: "Stand facing a wall with hands on it. Step one foot back, keep that heel down and knee straight, and lean into the wall until you feel a stretch in the calf. Hold, then switch." },
  { code: "foot-towel-scrunch", name: "Towel scrunches", bodyRegion: "ankle_foot", sets: 2, reps: 10, frequency: "Once a day",
    instructions: "Sit with a towel flat on the floor under your foot. Use your toes to scrunch the towel towards you, then spread it out again." },

  // Balance
  { code: "balance-single-leg", name: "Single leg stand", bodyRegion: "balance", sets: 1, reps: 3, holdSeconds: 30, frequency: "Twice a day",
    instructions: "Stand next to a counter for safety. Lift one foot off the floor and balance on the other leg. Hold, then switch. Touch the counter whenever you need to." },
  { code: "balance-tandem-stand", name: "Heel-to-toe stand", bodyRegion: "balance", sets: 1, reps: 3, holdSeconds: 30, frequency: "Twice a day",
    instructions: "Stand next to a counter. Place one foot directly in front of the other, heel touching toe. Hold your balance, then switch feet." },

  // General
  { code: "general-walking", name: "Walking", bodyRegion: "general", frequency: "Daily",
    instructions: "Walk at a comfortable pace on level ground. Build up the time gradually as your physiotherapist advises." },
  { code: "general-diaphragm-breathing", name: "Deep breathing", bodyRegion: "general", sets: 1, reps: 10, frequency: "Three times a day",
    instructions: "Sit or lie comfortably with one hand on your stomach. Breathe in slowly through your nose so your stomach rises, then breathe out slowly through pursed lips." },
];
