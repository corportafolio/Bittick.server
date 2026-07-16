const COLLECTION_NAME = 'Bittick Agent';
const COLLECTION_ID = 'bittick-agent';
const FOUNDER_NUMS = [0, 11, 22, 33, 44, 55, 66, 77, 88, 99];

function getTier(num) {
  return FOUNDER_NUMS.includes(num) ? 'FOUNDER' : 'STANDARD';
}

const BOTS = [
  { num: 0, inscriptionId: 'ef7563ebd206be7271685774b39eec7c188ff57f763e08b31e84732848c8101bi0', txGenesis: 'ef7563ebd206be7271685774b39eec7c188ff57f763e08b31e84732848c8101b', blockHeight: 957785, tier: 'FOUNDER' },
  { num: 1, inscriptionId: '633d5ed3dd194f7a185ca30a509974a1933a0e84db989298c1ee092ac810db36i0', txGenesis: '633d5ed3dd194f7a185ca30a509974a1933a0e84db989298c1ee092ac810db36', blockHeight: 957787 },
  { num: 2, inscriptionId: 'd5f21c0c8a4661f596f740203aeb934eee72f155277189dab5797b0864c6439fi0', txGenesis: 'd5f21c0c8a4661f596f740203aeb934eee72f155277189dab5797b0864c6439f', blockHeight: 957788 },
  { num: 3, inscriptionId: '6591e7240a5bb191055dc8e0ae4d81f7e4f933b85d6dc89c7904f9e45a513674i0', txGenesis: '6591e7240a5bb191055dc8e0ae4d81f7e4f933b85d6dc89c7904f9e45a513674', blockHeight: 957787 },
  { num: 4, inscriptionId: 'c31c1d04b68171b5405aea66f62111efd3a1c47cfbfcae8253146e448905fc50i0', txGenesis: 'c31c1d04b68171b5405aea66f62111efd3a1c47cfbfcae8253146e448905fc50', blockHeight: 957787 },
  { num: 5, inscriptionId: '09fef6597c5206b97372cedace97364f078b61ef468a0c2ef6b11e82df0995aci0', txGenesis: '09fef6597c5206b97372cedace97364f078b61ef468a0c2ef6b11e82df0995ac', blockHeight: 957788 },
  { num: 6, inscriptionId: 'ac7196dff767bfc870213adb557169984bc0c749452089cbceb1d5b6e395d95ci0', txGenesis: 'ac7196dff767bfc870213adb557169984bc0c749452089cbceb1d5b6e395d95c', blockHeight: 957787 },
  { num: 7, inscriptionId: '3e405acb3d046a38e8c31c99ccbee3b12221f3747fc0c5e3601997937a311b8ai0', txGenesis: '3e405acb3d046a38e8c31c99ccbee3b12221f3747fc0c5e3601997937a311b8a', blockHeight: 957787 },
  { num: 8, inscriptionId: '243f265f151bd3a68a96976bd51e9da5027ad5e3908e6d5fcbd6b4ec06e2ef59i0', txGenesis: '243f265f151bd3a68a96976bd51e9da5027ad5e3908e6d5fcbd6b4ec06e2ef59', blockHeight: 957787 },
  { num: 9, inscriptionId: '6355c18aa385c2d53c04e393a4ce0898f2add7aa99f9e0d03d299879b0fdb01ai0', txGenesis: '6355c18aa385c2d53c04e393a4ce0898f2add7aa99f9e0d03d299879b0fdb01a', blockHeight: 957785 },
  { num: 10, inscriptionId: '7a43b6c2c2129871bed2e1b34c766906ac407b0290c8d80353e2af19d7224d34i0', txGenesis: '7a43b6c2c2129871bed2e1b34c766906ac407b0290c8d80353e2af19d7224d34', blockHeight: 957787 },
  { num: 11, inscriptionId: '689556d4a1cabce4b4aed38dd92297300103d0e3232661a30c768b8e665a82e3i0', txGenesis: '689556d4a1cabce4b4aed38dd92297300103d0e3232661a30c768b8e665a82e3', blockHeight: 957788 },
  { num: 12, inscriptionId: 'd0d9ff1321be18a87f26dbf559018a0a53b712a3aed2d5bfe185241d106b32eei0', txGenesis: 'd0d9ff1321be18a87f26dbf559018a0a53b712a3aed2d5bfe185241d106b32ee', blockHeight: 957788 },
  { num: 13, inscriptionId: '99a721de93233abf5d3422514ad558dbdc84188e24dcf7afbb44ef754c1722edi0', txGenesis: '99a721de93233abf5d3422514ad558dbdc84188e24dcf7afbb44ef754c1722ed', blockHeight: 957788 },
  { num: 14, inscriptionId: '503874ef280d937f5ca003605a6991051a4a99ab0a07aab683c2ecf8d57cd4e1i0', txGenesis: '503874ef280d937f5ca003605a6991051a4a99ab0a07aab683c2ecf8d57cd4e1', blockHeight: 957788 },
  { num: 15, inscriptionId: 'e949b589cbda4717cbadf4038fe593d1c951a0ff63916311a024b11917fed419i0', txGenesis: 'e949b589cbda4717cbadf4038fe593d1c951a0ff63916311a024b11917fed419', blockHeight: 957785 },
  { num: 16, inscriptionId: '8ce536a14c2eee4a93d03c830aa120fcee2d5f393b112657b40605e2aefe02f9i0', txGenesis: '8ce536a14c2eee4a93d03c830aa120fcee2d5f393b112657b40605e2aefe02f9', blockHeight: 957788 },
  { num: 17, inscriptionId: 'ad6aba6b6cd912efeff5c3d890c9add62df8f86fa9948e26ace64473ebe92687i0', txGenesis: 'ad6aba6b6cd912efeff5c3d890c9add62df8f86fa9948e26ace64473ebe92687', blockHeight: 957787 },
  { num: 18, inscriptionId: '2528cc96797d94f23079801d467821895fd4dbf30271e034ce587336986c471bi0', txGenesis: '2528cc96797d94f23079801d467821895fd4dbf30271e034ce587336986c471b', blockHeight: 957785 },
  { num: 19, inscriptionId: '92ad1c5a101b00b0207c0739bd158aa71dbc8f80ce250838c5763c6b852ed26ei0', txGenesis: '92ad1c5a101b00b0207c0739bd158aa71dbc8f80ce250838c5763c6b852ed26e', blockHeight: 957787 },
  { num: 20, inscriptionId: '882a355585c5a3551cba8f7fbf52c9c764e9e41de56f4c912e066052d651314ci0', txGenesis: '882a355585c5a3551cba8f7fbf52c9c764e9e41de56f4c912e066052d651314c', blockHeight: 957787 },
  { num: 21, inscriptionId: '45bc3fbcfde94bde2f5fea8c0ab7eb953326170c06a26f69c6bd4dba419feb4fi0', txGenesis: '45bc3fbcfde94bde2f5fea8c0ab7eb953326170c06a26f69c6bd4dba419feb4f', blockHeight: 957787 },
  { num: 22, inscriptionId: '4afa6b39caabdc3129981eb82ec5983a52f7c8c706da9dbe2c7e81add4be9d28i0', txGenesis: '4afa6b39caabdc3129981eb82ec5983a52f7c8c706da9dbe2c7e81add4be9d28', blockHeight: 957785 },
  { num: 23, inscriptionId: '83e491550ea275cdb22a556012c6189157a420623353e95012432958f1a0fd99i0', txGenesis: '83e491550ea275cdb22a556012c6189157a420623353e95012432958f1a0fd99', blockHeight: 957788 },
  { num: 24, inscriptionId: '4590923d3eb6317681a873ec667efcacb48a99f6fdcaeb11e5f51db9c8c0add3i0', txGenesis: '4590923d3eb6317681a873ec667efcacb48a99f6fdcaeb11e5f51db9c8c0add3', blockHeight: 957788 },
  { num: 25, inscriptionId: 'b38cf13ad69cb4dfffefc9ee7702f3eb04ab3a4047446239b25a7eb3df81dd02i0', txGenesis: 'b38cf13ad69cb4dfffefc9ee7702f3eb04ab3a4047446239b25a7eb3df81dd02', blockHeight: 957787 },
  { num: 26, inscriptionId: '29e140578f127cb5e76e1603702eab692e6426ab91548d267c62afa10806db59i0', txGenesis: '29e140578f127cb5e76e1603702eab692e6426ab91548d267c62afa10806db59', blockHeight: 957787 },
  { num: 27, inscriptionId: 'd61fa23afb425bdc7e761e16d5ef5800daa38131ac8740dDF5dc6bc01a6e437ei0', txGenesis: 'd61fa23afb425bdc7e761e16d5ef5800daa38131ac8740ddf5dc6bc01a6e437e', blockHeight: 957787 },
  { num: 28, inscriptionId: '8685bc7098b5b03444eb29816e0138afd1f6e0b1bcf55edf28f2d86b499245c0i0', txGenesis: '8685bc7098b5b03444eb29816e0138afd1f6e0b1bcf55edf28f2d86b499245c0', blockHeight: 957788 },
  { num: 29, inscriptionId: 'de76ff396640773c09cf939c18a8593837015c27ab351456c60f90cc8f6b746fi0', txGenesis: 'de76ff396640773c09cf939c18a8593837015c27ab351456c60f90cc8f6b746f', blockHeight: 957787 },
  { num: 30, inscriptionId: '970b65cb118744d71b5c7baf0d41c251b0adbf57460024fc363806a48734e030i0', txGenesis: '970b65cb118744d71b5c7baf0d41c251b0adbf57460024fc363806a48734e030', blockHeight: 957787 },
  { num: 31, inscriptionId: '03dc94bc49890281e6973d40dc526b966aca5f117d036b700956c3c5803d2c32i0', txGenesis: '03dc94bc49890281e6973d40dc526b966aca5f117d036b700956c3c5803d2c32', blockHeight: 957787 },
  { num: 32, inscriptionId: 'f1c0f119ebcae98b06bb91604ac17d0adf1824f20518414da15f8c6af5d96bf9i0', txGenesis: 'f1c0f119ebcae98b06bb91604ac17d0adf1824f20518414da15f8c6af5d96bf9', blockHeight: 957788 },
  { num: 33, inscriptionId: '7164b1b5ef5cf6587c6102f256a1a82b723d6c2e00cbafaf521aaf28bedaf491i0', txGenesis: '7164b1b5ef5cf6587c6102f256a1a82b723d6c2e00cbafaf521aaf28bedaf491', blockHeight: 957787 },
  { num: 34, inscriptionId: '8bf00c12c9ca48e07f2485127520301bde95e28def39b6288b8554910b344a79i0', txGenesis: '8bf00c12c9ca48e07f2485127520301bde95e28def39b6288b8554910b344a79', blockHeight: 957787 },
  { num: 35, inscriptionId: '24f12a8c2d483c75b74f8cf47d61f6621edc3aa8284cbfd08884c1630478f894i0', txGenesis: '24f12a8c2d483c75b74f8cf47d61f6621edc3aa8284cbfd08884c1630478f894', blockHeight: 957788 },
  { num: 36, inscriptionId: '3d79e9955f4f739f07279b94f0f5d813fa9589eb42e7813db4b296bdd64e0466i0', txGenesis: '3d79e9955f4f739f07279b94f0f5d813fa9589eb42e7813db4b296bdd64e0466', blockHeight: 957787 },
  { num: 37, inscriptionId: 'bde1b401d0df88cac24f0aabebb2855919cbf93fa23ae6316803ff9d8d651472i0', txGenesis: 'bde1b401d0df88cac24f0aabebb2855919cbf93fa23ae6316803ff9d8d651472', blockHeight: 957787 },
  { num: 38, inscriptionId: '58fa453eac6cb88ae9d1a3ebeb294c73ba6b6cc5f0f7a1f5d342bc5aed429007i0', txGenesis: '58fa453eac6cb88ae9d1a3ebeb294c73ba6b6cc5f0f7a1f5d342bc5aed429007', blockHeight: 957787 },
  { num: 39, inscriptionId: 'f4f5c9808c47eb5b92acbf4ece213979373b7b4d951b1e99c2248819ce214162i0', txGenesis: 'f4f5c9808c47eb5b92acbf4ece213979373b7b4d951b1e99c2248819ce214162', blockHeight: 957787 },
  { num: 40, inscriptionId: '0d230d3f711e5e6512eefdcd019833ebd89de395a207449842b302ef3ac68199i0', txGenesis: '0d230d3f711e5e6512eefdcd019833ebd89de395a207449842b302ef3ac68199', blockHeight: 957788 },
  { num: 41, inscriptionId: '29b8b578b900d72bddb937b80ced4fae795d42588b94597a28367b30ba09d4abi0', txGenesis: '29b8b578b900d72bddb937b80ced4fae795d42588b94597a28367b30ba09d4ab', blockHeight: 957788 },
  { num: 42, inscriptionId: 'e4032d004467482bff46a8f9995d09e9bce52931a8099351390ab52cee4c9286i0', txGenesis: 'e4032d004467482bff46a8f9995d09e9bce52931a8099351390ab52cee4c9286', blockHeight: 957787 },
  { num: 43, inscriptionId: 'b4d47c1a7906e0168eaa2d2088c890417c903952e908fd3d566fe5c6e0e0d27ai0', txGenesis: 'b4d47c1a7906e0168eaa2d2088c890417c903952e908fd3d566fe5c6e0e0d27a', blockHeight: 957787 },
  { num: 44, inscriptionId: 'f75cdac629b0f2e5fe31e76b485b8f427cc52b3939742fe0c891ea7a87c9118ci0', txGenesis: 'f75cdac629b0f2e5fe31e76b485b8f427cc52b3939742fe0c891ea7a87c9118c', blockHeight: 957787 },
  { num: 45, inscriptionId: '811cf5935aafb2cb3a81e412253c1a3ae52c4ac5269b9aef16315567665ea8c4i0', txGenesis: '811cf5935aafb2cb3a81e412253c1a3ae52c4ac5269b9aef16315567665ea8c4', blockHeight: 957788 },
  { num: 46, inscriptionId: '73be123b182f095d738fc9ea9bbb55331c3fb27558eaac855ebba2140eecc32fi0', txGenesis: '73be123b182f095d738fc9ea9bbb55331c3fb27558eaac855ebba2140eecc32f', blockHeight: 957787 },
  { num: 47, inscriptionId: '9c21c9ec6b20da1574bb470fb601e63d14c4acecf4b208d028dde89a702c8e7bi0', txGenesis: '9c21c9ec6b20da1574bb470fb601e63d14c4acecf4b208d028dde89a702c8e7b', blockHeight: 957787 },
  { num: 48, inscriptionId: '45e534be0461754ea6ac5394bf2389d95514892c98e034d4c3611932bbfc2a0ei0', txGenesis: '45e534be0461754ea6ac5394bf2389d95514892c98e034d4c3611932bbfc2a0e', blockHeight: 957787 },
  { num: 49, inscriptionId: '228127f9a2dfc8f87f5f85de5ba76507d88a77fe660da9422b3c3686441b85fai0', txGenesis: '228127f9a2dfc8f87f5f85de5ba76507d88a77fe660da9422b3c3686441b85fa', blockHeight: 957788 },
  { num: 50, inscriptionId: '58b7f728f29472ac2635b2070d615c2f30fff6f2caac403b177f7d82cc9a2084i0', txGenesis: '58b7f728f29472ac2635b2070d615c2f30fff6f2caac403b177f7d82cc9a2084', blockHeight: 957787 },
  { num: 51, inscriptionId: '92ee4c09318d24c1924ac0bc734f6b1824ba9d481fb0061fa35a22838d792d72i0', txGenesis: '92ee4c09318d24c1924ac0bc734f6b1824ba9d481fb0061fa35a22838d792d72', blockHeight: 957787 },
  { num: 52, inscriptionId: 'b456dda52ab58952ef8fc7423cce826cf67e31c5812b3add8f673f92a4a70db5i0', txGenesis: 'b456dda52ab58952ef8fc7423cce826cf67e31c5812b3add8f673f92a4a70db5', blockHeight: 957788 },
  { num: 53, inscriptionId: '2e87413c693d0005814d2b9ab20d84bc716634e0a54757c8ccc6742fe2fa12a4i0', txGenesis: '2e87413c693d0005814d2b9ab20d84bc716634e0a54757c8ccc6742fe2fa12a4', blockHeight: 957788 },
  { num: 54, inscriptionId: 'd8dfd0826795531a733eca924542a7204e8500ce0c014a5013b1194ca469b9eci0', txGenesis: 'd8dfd0826795531a733eca924542a7204e8500ce0c014a5013b1194ca469b9ec', blockHeight: 957788 },
  { num: 55, inscriptionId: '1902e998ad4824ecd998b75908e22a5da80f6bb3f1e517bae71739f3622b1883i0', txGenesis: '1902e998ad4824ecd998b75908e22a5da80f6bb3f1e517bae71739f3622b1883', blockHeight: 957787 },
  { num: 56, inscriptionId: 'd934715b90b2356acb89d5574b3fd8748eb2d1124750ff8d043d869753a1d925i0', txGenesis: 'd934715b90b2356acb89d5574b3fd8748eb2d1124750ff8d043d869753a1d925', blockHeight: 957787 },
  { num: 57, inscriptionId: 'da120821ffc8114e2483ba2574ef2dbf173f00b397406cf46f836590a9ef3ed9i0', txGenesis: 'da120821ffc8114e2483ba2574ef2dbf173f00b397406cf46f836590a9ef3ed9', blockHeight: 957788 },
  { num: 58, inscriptionId: '42e6c96d2f6b045a262c326e984edb490ee3b03d51414809229e080d58eca24di0', txGenesis: '42e6c96d2f6b045a262c326e984edb490ee3b03d51414809229e080d58eca24d', blockHeight: 957787 },
  { num: 59, inscriptionId: '916248ec5f0334630215047eebd77094dba472a10369f8d9e06d4ee3f101c294i0', txGenesis: '916248ec5f0334630215047eebd77094dba472a10369f8d9e06d4ee3f101c294', blockHeight: 957787 },
  { num: 60, inscriptionId: 'be91b3292201950307b40185f7c5df5a6fede80ab6878e5a13d7dc8d1f484611i0', txGenesis: 'be91b3292201950307b40185f7c5df5a6fede80ab6878e5a13d7dc8d1f484611', blockHeight: 957787 },
  { num: 61, inscriptionId: '51dc78376d470000664a75a58cf774f8ce70a5d3d31c887c63237ec6b0148404i0', txGenesis: '51dc78376d470000664a75a58cf774f8ce70a5d3d31c887c63237ec6b0148404', blockHeight: 957787 },
  { num: 62, inscriptionId: 'abc8a24266f6541381b5f74c5311bfec2df9fa412e8ab2ccd9d6134de754afabi0', txGenesis: 'abc8a24266f6541381b5f74c5311bfec2df9fa412e8ab2ccd9d6134de754afab', blockHeight: 957788 },
  { num: 63, inscriptionId: '90e860483e95379ad5165c74e53120afa3ba3bd5df1800ab5041552ec411a2b2i0', txGenesis: '90e860483e95379ad5165c74e53120afa3ba3bd5df1800ab5041552ec411a2b2', blockHeight: 957788 },
  { num: 64, inscriptionId: '826e15d51130ae4fb7a390e1271af9b3220f5958f375e8d4864ae06a619c06cci0', txGenesis: '826e15d51130ae4fb7a390e1271af9b3220f5958f375e8d4864ae06a619c06cc', blockHeight: 957788 },
  { num: 65, inscriptionId: '548697fc005204bee88b4b4b39b30cfb4438d38013252788c82c8851ca544902i0', txGenesis: '548697fc005204bee88b4b4b39b30cfb4438d38013252788c82c8851ca544902', blockHeight: 957787 },
  { num: 66, inscriptionId: '8f9a0d6a161e196c64a2d6bb2b015b53a116e520e47fae281ff17abcc9a2e567i0', txGenesis: '8f9a0d6a161e196c64a2d6bb2b015b53a116e520e47fae281ff17abcc9a2e567', blockHeight: 957787 },
  { num: 67, inscriptionId: 'dff07545e1bbf2a4a11513db8b4dc2f938da6fd0aceb2ab1954a3d4ff8861ef0i0', txGenesis: 'dff07545e1bbf2a4a11513db8b4dc2f938da6fd0aceb2ab1954a3d4ff8861ef0', blockHeight: 957788 },
  { num: 68, inscriptionId: 'f9ff2b82c9d6743e6179be42a1a5d77c0340c5d4d312dda61d2b8f5cebcc7959i0', txGenesis: 'f9ff2b82c9d6743e6179be42a1a5d77c0340c5d4d312dda61d2b8f5cebcc7959', blockHeight: 957787 },
  { num: 69, inscriptionId: '98b325df0c7245383834eebc9314dfb018281db8f7ca6401bbdf7704adbfab1bi0', txGenesis: '98b325df0c7245383834eebc9314dfb018281db8f7ca6401bbdf7704adbfab1b', blockHeight: 957787 },
  { num: 70, inscriptionId: '07d6d0fe550d6b7195ee9ff1d66d34fe610c29818e1ac5924ddb3a7cddc8847di0', txGenesis: '07d6d0fe550d6b7195ee9ff1d66d34fe610c29818e1ac5924ddb3a7cddc8847d', blockHeight: 957787 },
  { num: 71, inscriptionId: '21bf7682abebb926d14d865b53155b5298858e63529916328001f70a8a4b5aa2i0', txGenesis: '21bf7682abebb926d14d865b53155b5298858e63529916328001f70a8a4b5aa2', blockHeight: 957788 },
  { num: 72, inscriptionId: 'f6eaccc9c7c7e5eae6961a081ec5a37f912bb6a031e927a7aef53ed917b40939i0', txGenesis: 'f6eaccc9c7c7e5eae6961a081ec5a37f912bb6a031e927a7aef53ed917b40939', blockHeight: 957787 },
  { num: 73, inscriptionId: '7d0f975378fee222b997005cc546adc33631a507f0812af2445c85eb4aee2301i0', txGenesis: '7d0f975378fee222b997005cc546adc33631a507f0812af2445c85eb4aee2301', blockHeight: 957787 },
  { num: 74, inscriptionId: '0600991281043e1951a4642887c7daabd18282ff210be85af44bd73f9dc89c18i0', txGenesis: '0600991281043e1951a4642887c7daabd18282ff210be85af44bd73f9dc89c18', blockHeight: 957787 },
  { num: 75, inscriptionId: '54a6c8dccc3734e981dc66f67cab5786e2f97d5727b426ffc2060dac43a7019bi0', txGenesis: '54a6c8dccc3734e981dc66f67cab5786e2f97d5727b426ffc2060dac43a7019b', blockHeight: 957788 },
  { num: 76, inscriptionId: '72ae20bb1a21652c1b49abe7fabd29769b65c6002732507e388c4ee2d6ced58di0', txGenesis: '72ae20bb1a21652c1b49abe7fabd29769b65c6002732507e388c4ee2d6ced58d', blockHeight: 957787 },
  { num: 77, inscriptionId: '17619ba73f46f3eaeaa1d9aa4036d46347f179f9cc4db1d3f4018f8130d1a3f6i0', txGenesis: '17619ba73f46f3eaeaa1d9aa4036d46347f179f9cc4db1d3f4018f8130d1a3f6', blockHeight: 957788 },
  { num: 78, inscriptionId: 'c65696cb378166ddba3901e28225e2167120b778996cf609ad020b1a63ebc97ci0', txGenesis: 'c65696cb378166ddba3901e28225e2167120b778996cf609ad020b1a63ebc97c', blockHeight: 957787 },
  { num: 79, inscriptionId: '3bbc43a3186c35bb9cbca634221a8e767ffa249646755abbdb200e24fd0c9eeci0', txGenesis: '3bbc43a3186c35bb9cbca634221a8e767ffa249646755abbdb200e24fd0c9eec', blockHeight: 957788 },
  { num: 80, inscriptionId: '98a40d5658e1a009c9cc64493c3c10a0cbe714e272fabf2f114e92e3ffb86a86i0', txGenesis: '98a40d5658e1a009c9cc64493c3c10a0cbe714e272fabf2f114e92e3ffb86a86', blockHeight: 957787 },
  { num: 81, inscriptionId: 'ed166c31250b880ed7957232688f92fbc313a247f45afdcae78e530e8e7fbd77i0', txGenesis: 'ed166c31250b880ed7957232688f92fbc313a247f45afdcae78e530e8e7fbd77', blockHeight: 957787 },
  { num: 82, inscriptionId: 'a10a315d13052a44a5511b725e44b59a2dd75693b74ff36acc81eb1fdd4819e0i0', txGenesis: 'a10a315d13052a44a5511b725e44b59a2dd75693b74ff36acc81eb1fdd4819e0', blockHeight: 957788 },
  { num: 83, inscriptionId: '9bd41055cf8489da3848903d62a2ea6f8cae0ae1736fb94f70c5a8175625079fi0', txGenesis: '9bd41055cf8489da3848903d62a2ea6f8cae0ae1736fb94f70c5a8175625079f', blockHeight: 957788 },
  { num: 84, inscriptionId: 'ddfa1e890b022a8c088d4ad9d92e9b002a247218f48d49c4a0173c5f8f8a3dedi0', txGenesis: 'ddfa1e890b022a8c088d4ad9d92e9b002a247218f48d49c4a0173c5f8f8a3ded', blockHeight: 957788 },
  { num: 85, inscriptionId: 'effc0cbe946622a7f43c52f88b1680d8b7efebeca906323134e474e140399489i0', txGenesis: 'effc0cbe946622a7f43c52f88b1680d8b7efebeca906323134e474e140399489', blockHeight: 957787 },
  { num: 86, inscriptionId: '02e874b14d3b01612f304f3a8c82fa0a7e7c347430acc26968598f4ad3697ba5i0', txGenesis: '02e874b14d3b01612f304f3a8c82fa0a7e7c347430acc26968598f4ad3697ba5', blockHeight: 957788 },
  { num: 87, inscriptionId: '58f098377551bc9312f52993b3480a52dc09fd20635fcfbf821d98e6920b97a2i0', txGenesis: '58f098377551bc9312f52993b3480a52dc09fd20635fcfbf821d98e6920b97a2', blockHeight: 957788 },
  { num: 88, inscriptionId: '7dc12cfc856487f1f768d818f593acf978c7d42884c1e4d50ea688bb0c2b4c5bi0', txGenesis: '7dc12cfc856487f1f768d818f593acf978c7d42884c1e4d50ea688bb0c2b4c5b', blockHeight: 957787 },
  { num: 89, inscriptionId: 'e29a0e7861a5847deced7e46237806f87313ad8cb1cc35a57f4b278afcd48e50i0', txGenesis: 'e29a0e7861a5847deced7e46237806f87313ad8cb1cc35a57f4b278afcd48e50', blockHeight: 957787 },
  { num: 90, inscriptionId: '8c7878a7948c521ac9c96059cf787166fa0c8716328911d40695563960e0b24fi0', txGenesis: '8c7878a7948c521ac9c96059cf787166fa0c8716328911d40695563960e0b24f', blockHeight: 957787 },
  { num: 91, inscriptionId: 'fd39f74305ac3fa60ac9ac6bbdf42bacbd3173cd6827b3c0aef33a1c35693b9ai0', txGenesis: 'fd39f74305ac3fa60ac9ac6bbdf42bacbd3173cd6827b3c0aef33a1c35693b9a', blockHeight: 957788 },
  { num: 92, inscriptionId: 'c87516288ae373f6501566f6a4d793545fe2f401c309a89addda2702ea023f7di0', txGenesis: 'c87516288ae373f6501566f6a4d793545fe2f401c309a89addda2702ea023f7d', blockHeight: 957787 },
  { num: 93, inscriptionId: '65e789b74592b7038d23fa9028df406351e220116626766bb772f168ff6cfadci0', txGenesis: '65e789b74592b7038d23fa9028df406351e220116626766bb772f168ff6cfadc', blockHeight: 957788 },
  { num: 94, inscriptionId: '8000b1bfd89d19193bc314cc66ee1640e792783c9746cb0c322daa7724e837cfi0', txGenesis: '8000b1bfd89d19193bc314cc66ee1640e792783c9746cb0c322daa7724e837cf', blockHeight: 957788 },
  { num: 95, inscriptionId: '535f16e0087d402fe71aad1f25e91ba11551f4a189472031968db98cdf558ef5i0', txGenesis: '535f16e0087d402fe71aad1f25e91ba11551f4a189472031968db98cdf558ef5', blockHeight: 957788 },
  { num: 96, inscriptionId: 'fb14e1da5c10ce2fd9e7f8502c49ab14d7511da533f4b18b3eb64e2b448b72c4i0', txGenesis: 'fb14e1da5c10ce2fd9e7f8502c49ab14d7511da533f4b18b3eb64e2b448b72c4', blockHeight: 957788 },
  { num: 97, inscriptionId: '4bf11b2cd10f5dbdc8437515892ad51ca9b244f2e95b59986e9ad6dbd331d0eai0', txGenesis: '4bf11b2cd10f5dbdc8437515892ad51ca9b244f2e95b59986e9ad6dbd331d0ea', blockHeight: 957788 },
  { num: 98, inscriptionId: 'b7ab4397fdc8237864ed2508e9f1046b59e1c222a76a93bf3a1469070c731465i0', txGenesis: 'b7ab4397fdc8237864ed2508e9f1046b59e1c222a76a93bf3a1469070c731465', blockHeight: 957787 },
  { num: 99, inscriptionId: '3bd41b37d01392366ab5968e0b79db5b8ca59bbb90d6f0fbb417d32c720b0cc4i0', txGenesis: '3bd41b37d01392366ab5968e0b79db5b8ca59bbb90d6f0fbb417d32c720b0cc4', blockHeight: 957788 }
];

BOTS.forEach(b => { b.tier = getTier(b.num); });

const INSCRIPTION_ID_SET = new Set(BOTS.map(b => b.inscriptionId));

function getBotByInscriptionId(inscriptionId) {
  return BOTS.find(b => b.inscriptionId === inscriptionId) || null;
}

function getBotByNum(num) {
  return BOTS.find(b => b.num === num) || null;
}

function hasInscriptionId(inscriptionId) {
  return INSCRIPTION_ID_SET.has(inscriptionId);
}

function getAllInscriptionIds() {
  return BOTS.map(b => b.inscriptionId);
}

function getAllInscriptionsWithInfo() {
  return BOTS.map(b => ({
    num: b.num,
    inscriptionId: b.inscriptionId,
    tier: b.tier,
    botImageUrl: `/api/auth/bot-image/${b.num.toString().padStart(2, '0')}`
  }));
}

function getTotalBots() {
  return BOTS.length;
}

module.exports = {
  COLLECTION_NAME,
  COLLECTION_ID,
  FOUNDER_NUMS,
  BOTS,
  INSCRIPTION_ID_SET,
  getBotByInscriptionId,
  getBotByNum,
  hasInscriptionId,
  getAllInscriptionIds,
  getAllInscriptionsWithInfo,
  getTier,
  getTotalBots
};