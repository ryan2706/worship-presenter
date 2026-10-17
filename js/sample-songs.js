// Sample songs copied into the library the first time the app runs.
// Every one is a public-domain hymn, in the wording most churches sing today.
// All the verses here were in print before 1929.
//
// Each song:
//   sections  the words, one section per slide
//   order     the sections in the order they're sung, so a chorus can repeat
//             (leave it out to use the sections in the order listed)
//   source    where the wording differs from the author's first version

export const SAMPLE_SONGS = [
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    author: 'John Newton',
    year: 1779,
    source: 'Verse 5 ("When we’ve been there…") was added by 1829 and was standard by 1910.',
    sections: [
      {
        name: 'Verse 1',
        text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.',
      },
      {
        name: 'Verse 2',
        text: '’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!',
      },
      {
        name: 'Verse 3',
        text: 'Through many dangers, toils and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.',
      },
      {
        name: 'Verse 4',
        text: 'The Lord has promised good to me,\nHis word my hope secures;\nHe will my shield and portion be\nAs long as life endures.',
      },
      {
        name: 'Verse 5',
        text: 'When we’ve been there ten thousand years,\nBright shining as the sun,\nWe’ve no less days to sing God’s praise\nThan when we’d first begun.',
      },
    ],
  },
  {
    id: 'be-thou-my-vision',
    title: 'Be Thou My Vision',
    author: 'Irish, translated by Mary Byrne (1905), put into verse by Eleanor Hull',
    year: 1912,
    source: 'Verses 2 and 5 use the smoothed wording of later hymnals rather than Hull’s exact lines.',
    sections: [
      {
        name: 'Verse 1',
        text: 'Be Thou my Vision, O Lord of my heart;\nNaught be all else to me, save that Thou art;\nThou my best thought, by day or by night,\nWaking or sleeping, Thy presence my light.',
      },
      {
        name: 'Verse 2',
        text: 'Be Thou my Wisdom, and Thou my true Word;\nI ever with Thee and Thou with me, Lord;\nThou my great Father, I Thy true son;\nThou in me dwelling, and I with Thee one.',
      },
      {
        name: 'Verse 3',
        text: 'Be Thou my battle Shield, Sword for the fight;\nBe Thou my Dignity, Thou my Delight;\nThou my soul’s Shelter, Thou my high Tower:\nRaise Thou me heavenward, O Power of my power.',
      },
      {
        name: 'Verse 4',
        text: 'Riches I heed not, nor man’s empty praise,\nThou mine Inheritance, now and always:\nThou and Thou only, first in my heart,\nHigh King of Heaven, my Treasure Thou art.',
      },
      {
        name: 'Verse 5',
        text: 'High King of Heaven, my victory won,\nMay I reach Heaven’s joys, O bright Heaven’s Sun!\nHeart of my own heart, whatever befall,\nStill be my Vision, O Ruler of all.',
      },
    ],
  },
  {
    id: 'blessed-assurance',
    title: 'Blessed Assurance',
    author: 'Fanny Crosby',
    year: 1873,
    sections: [
      {
        name: 'Verse 1',
        text: 'Blessed assurance, Jesus is mine!\nO what a foretaste of glory divine!\nHeir of salvation, purchase of God,\nBorn of His Spirit, washed in His blood.',
      },
      {
        name: 'Chorus',
        text: 'This is my story, this is my song,\nPraising my Savior all the day long;\nThis is my story, this is my song,\nPraising my Savior all the day long.',
      },
      {
        name: 'Verse 2',
        text: 'Perfect submission, perfect delight,\nVisions of rapture now burst on my sight;\nAngels descending bring from above\nEchoes of mercy, whispers of love.',
      },
      {
        name: 'Verse 3',
        text: 'Perfect submission, all is at rest;\nI in my Savior am happy and blest,\nWatching and waiting, looking above,\nFilled with His goodness, lost in His love.',
      },
    ],
    order: ['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus'],
  },
  {
    id: 'come-thou-fount',
    title: 'Come, Thou Fount of Every Blessing',
    author: 'Robert Robinson',
    year: 1758,
    source: 'Wording as in 19th-century hymnals, which changed a few of Robinson’s lines.',
    sections: [
      {
        name: 'Verse 1',
        text: 'Come, Thou Fount of every blessing,\nTune my heart to sing Thy grace;\nStreams of mercy, never ceasing,\nCall for songs of loudest praise.\nTeach me some melodious sonnet,\nSung by flaming tongues above.\nPraise the mount! I’m fixed upon it,\nMount of Thy redeeming love.',
      },
      {
        name: 'Verse 2',
        text: 'Here I raise my Ebenezer;\nHither by Thy help I’m come;\nAnd I hope, by Thy good pleasure,\nSafely to arrive at home.\nJesus sought me when a stranger,\nWandering from the fold of God;\nHe, to rescue me from danger,\nInterposed His precious blood.',
      },
      {
        name: 'Verse 3',
        text: 'O to grace how great a debtor\nDaily I’m constrained to be!\nLet Thy goodness, like a fetter,\nBind my wandering heart to Thee.\nProne to wander, Lord, I feel it,\nProne to leave the God I love;\nHere’s my heart, O take and seal it,\nSeal it for Thy courts above.',
      },
    ],
  },
  {
    id: 'holy-holy-holy',
    title: 'Holy, Holy, Holy',
    author: 'Reginald Heber',
    year: 1826,
    sections: [
      {
        name: 'Verse 1',
        text: 'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessèd Trinity!',
      },
      {
        name: 'Verse 2',
        text: 'Holy, holy, holy! All the saints adore Thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before Thee,\nWhich wert, and art, and evermore shalt be.',
      },
      {
        name: 'Verse 3',
        text: 'Holy, holy, holy! Though the darkness hide Thee,\nThough the eye of sinful man Thy glory may not see;\nOnly Thou art holy; there is none beside Thee,\nPerfect in power, in love, and purity.',
      },
      {
        name: 'Verse 4',
        text: 'Holy, holy, holy! Lord God Almighty!\nAll Thy works shall praise Thy name, in earth, and sky, and sea;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessèd Trinity!',
      },
    ],
  },
  {
    id: 'it-is-well',
    title: 'It Is Well with My Soul',
    author: 'Horatio Spafford',
    year: 1873,
    sections: [
      {
        name: 'Verse 1',
        text: 'When peace like a river attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well with my soul.',
      },
      {
        name: 'Chorus',
        text: 'It is well with my soul,\nIt is well, it is well with my soul.',
      },
      {
        name: 'Verse 2',
        text: 'Though Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ has regarded my helpless estate,\nAnd hath shed His own blood for my soul.',
      },
      {
        name: 'Verse 3',
        text: 'My sin, oh, the bliss of this glorious thought!\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!',
      },
      {
        name: 'Verse 4',
        text: 'And Lord, haste the day when my faith shall be sight,\nThe clouds be rolled back as a scroll;\nThe trump shall resound, and the Lord shall descend,\nEven so, it is well with my soul.',
      },
    ],
    order: ['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Verse 4', 'Chorus'],
  },
  {
    id: 'rock-of-ages',
    title: 'Rock of Ages',
    author: 'Augustus Toplady',
    year: 1776,
    source: 'Verse 4 uses the 1815 wording "When mine eyes shall close in death".',
    sections: [
      {
        name: 'Verse 1',
        text: 'Rock of Ages, cleft for me,\nLet me hide myself in Thee;\nLet the water and the blood,\nFrom Thy wounded side which flowed,\nBe of sin the double cure,\nSave from wrath and make me pure.',
      },
      {
        name: 'Verse 2',
        text: 'Not the labors of my hands\nCan fulfill Thy law’s demands;\nCould my zeal no respite know,\nCould my tears forever flow,\nAll for sin could not atone;\nThou must save, and Thou alone.',
      },
      {
        name: 'Verse 3',
        text: 'Nothing in my hand I bring,\nSimply to the cross I cling;\nNaked, come to Thee for dress;\nHelpless, look to Thee for grace;\nFoul, I to the fountain fly;\nWash me, Savior, or I die.',
      },
      {
        name: 'Verse 4',
        text: 'While I draw this fleeting breath,\nWhen mine eyes shall close in death,\nWhen I soar to worlds unknown,\nSee Thee on Thy judgment throne,\nRock of Ages, cleft for me,\nLet me hide myself in Thee.',
      },
    ],
  },
  {
    id: 'what-a-friend',
    title: 'What a Friend We Have in Jesus',
    author: 'Joseph Scriven',
    year: 1855,
    sections: [
      {
        name: 'Verse 1',
        text: 'What a friend we have in Jesus,\nAll our sins and griefs to bear!\nWhat a privilege to carry\nEverything to God in prayer!\nO what peace we often forfeit,\nO what needless pain we bear,\nAll because we do not carry\nEverything to God in prayer!',
      },
      {
        name: 'Verse 2',
        text: 'Have we trials and temptations?\nIs there trouble anywhere?\nWe should never be discouraged;\nTake it to the Lord in prayer.\nCan we find a friend so faithful\nWho will all our sorrows share?\nJesus knows our every weakness;\nTake it to the Lord in prayer.',
      },
      {
        name: 'Verse 3',
        text: 'Are we weak and heavy laden,\nCumbered with a load of care?\nPrecious Savior, still our refuge;\nTake it to the Lord in prayer.\nDo thy friends despise, forsake thee?\nTake it to the Lord in prayer!\nIn His arms He’ll take and shield thee;\nThou wilt find a solace there.',
      },
    ],
  },
];
