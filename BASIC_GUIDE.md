# Basic guide how to start project and perform basic animgraph simulation

## Prereqs files extracted with help of WolvenKit:

* base\gameplay\anim_graphs\player__base.animgraph.json
* base\gameplay\anim_graphs\player__locomotion.animgraph.json
* base\animations\player\female\body\player__locomotion.anims.json
* base\animations\player\female\body\player__locomotion.anims.glb
* base\characters\entities\player\player_woman_skeleton.rig.json

## Guide:

First step is to open animgraph editor

### First animgraph

1. In welcome dialog find on disk and select exported **base\gameplay\anim_graphs\player__base.animgraph.json**
2. After selecting **base\gameplay\anim_graphs\player__base.animgraph.json** button **open** will appear on selected row
3. Press button **open** you should see section **Animgraph load settings**  with animgraph load settings **leave all defaults**
4. Press btn **Load** at the bottom of the welcome dialog

### Addition of the sub animgraph

1. Go to app main menu **File -> Add Animgraph...** it will open **Add Animgraph** dialog
2. In dialog find on disk and select exported **base\gameplay\anim_graphs\player__locomotion.animgraph.json** button **open** will appear on selected row
3. Press button **open** you should see section **Animgraph load settings** with animgraph load settings
4. Write text **locomotion** into **Diagram Id** input
5. Press btn **Add** at the bottom of the dialog
6. After animgraph loaded you should see 2 diagrams **main** and **locomotion** in the bottom left corner of the app

### Basic simulation setup

1. Go to app main menu **View -> Simulation...** it will open **Simulation** panel in the sidebar
2. In **Simulation** panel go to **Resources** tab
3. Row with more tabs should appear **Anim sets** | **Anim DB** | **Rig** | **Entity**
4. First we need to add **anim sets** to the project and related animations into them
   1. Go to **Anim sets** tab
   2. Press btn with **upload** icon at the right side under the tabs
   3. Find on disk and open **base\animations\player\female\body\player__locomotion.anims.json** file
   4. You should see collapsed item **player_locomotion.json** and list of clips below appear
   5. Expand collapsed **player_locomotion.json** item
   6. Find row **pose (.anims.glb)** and icon button **Load.glb** at the right side -> press it
   7. Find on disk and open **base\animations\player\female\body\player__locomotion.anims.glb** file
   8. You should see source **player_locomotion.anims.glb** appear in **pose (.anims.glb)** row
5. Second we need to add Rig to the project
   1. Go to **Rig** tab
   2. Press btn with **upload** icon at the right side under the tabs
   3. Find on disk and open **base\characters\entities\player\player_woman_skeleton.rig.json** file
   4. You should see loaded rig item and list of bones
6. Go to app main menu **File -> Save as...** to save project and not repeat steps above again

### Simulation

1. At the top of **simulation** panel press button **Activate**
2. At the top of **simulation** panel press button **Play**
3. Press button **Skeleton** to see skeleton window
4. Press button **Status** to see sim status window
