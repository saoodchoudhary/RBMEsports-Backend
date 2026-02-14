const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const User = require('../models/User');
const Payment = require('../models/Payment');

// NEW
const { validateAndApplyCoupon, markCouponUsed } = require("../utils/coupon.utils");

// @desc    Get all tournaments
// @route   GET /api/tournaments
// @access  Public
exports.getAllTournaments = async (req, res, next) => {
  try {
    const { status, type, featured, limit = 10, page = 1 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.tournamentType = type;
    if (featured) query.isFeatured = featured === 'true';

    const tournaments = await Tournament.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Tournament.countDocuments(query);

    res.status(200).json({
      success: true,
      count: tournaments.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: tournaments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single tournament
// @route   GET /api/tournaments/:id
// @access  Public
exports.getTournament = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('participants.userId', 'name inGameName bgmiId')
      .populate('winners.userId', 'name inGameName')
      .populate('winners.teamId', 'teamName members');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Increment view count
    tournament.viewCount += 1;
    await tournament.save();

    res.status(200).json({
      success: true,
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register for tournament (Solo/Duo)
// @route   POST /api/tournaments/:id/register
// @access  Private
exports.registerForTournament = async (req, res, next) => {
  try {
    const { couponCode } = req.body;

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    if (tournament.tournamentType === 'squad') {
      return res.status(400).json({
        success: false,
        message: 'Please use squad registration endpoint'
      });
    }

    const now = new Date();
    const regStart = new Date(tournament.registrationStartDate);
    const regEnd = new Date(tournament.registrationEndDate);

    if (now < regStart) {
      return res.status(400).json({ success: false, message: 'Registration has not started yet' });
    }

    if (now > regEnd) {
      return res.status(400).json({ success: false, message: 'Registration period has ended' });
    }

    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return res.status(400).json({ success: false, message: 'Tournament is full' });
    }

    const alreadyRegistered = tournament.participants.some(
      p => p.userId.toString() === req.user.id
    );

    if (alreadyRegistered) {
      return res.status(400).json({ success: false, message: 'Already registered for this tournament' });
    }

    const user = await User.findById(req.user.id);
    if (!user.bgmiId || !user.inGameName) {
      return res.status(400).json({ success: false, message: 'Please complete your profile with BGMI ID and In-Game Name' });
    }

    const bgmiAlreadyInTournament = tournament.participants.some(
      p => (p.bgmiId || "").trim() === (user.bgmiId || "").trim()
    );
    if (bgmiAlreadyInTournament) {
      return res.status(400).json({ success: false, message: 'This BGMI ID is already registered in this tournament' });
    }

    let partnerInfo = null;
    if (tournament.tournamentType === 'duo') {
      const { partnerBgmiId, partnerInGameName } = req.body;
      if (!partnerBgmiId || !partnerInGameName) {
        return res.status(400).json({ success: false, message: 'Please provide partner BGMI ID and In-Game Name' });
      }
      partnerInfo = { bgmiId: partnerBgmiId, inGameName: partnerInGameName };
    }

    let payment = null;

    const baseAmount = tournament.isFree ? 0 : (tournament.serviceFee || 0);

    const couponResult = await validateAndApplyCoupon({
      couponCode,
      user,
      tournament,
      baseAmount
    });

    const finalAmount = couponResult.finalAmount;
    const discountAmount = couponResult.discountAmount;

    if (!tournament.isFree) {
      if (finalAmount === 0) {
        payment = await Payment.create({
          paymentType: 'individual',
          userId: req.user.id,
          tournamentId: tournament._id,

          baseAmount,
          discountAmount,
          couponCode: couponResult.coupon ? couponResult.coupon.code : undefined,
          couponId: couponResult.coupon ? couponResult.coupon._id : undefined,

          amount: 0,
          currency: 'INR',
          paymentStatus: 'success',
          paymentGateway: 'manual',
          paymentMethod: { type: 'coupon' },

          customerDetails: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            bgmiId: user.bgmiId,
            inGameName: user.inGameName
          },
          metadata: {
            pricing: { baseAmount, discountAmount, finalAmount },
            coupon: couponResult.coupon
              ? { code: couponResult.coupon.code, type: couponResult.coupon.discountType, value: couponResult.coupon.discountValue }
              : null
          }
        });

        if (couponResult.coupon) {
          await markCouponUsed({ couponId: couponResult.coupon._id, userId: user._id });
        }
      } else {
        // ✅ SWITCH TO MANUAL (NO RAZORPAY)
        payment = await Payment.create({
          paymentType: 'individual',
          userId: req.user.id,
          tournamentId: tournament._id,

          baseAmount,
          discountAmount,
          couponCode: couponResult.coupon ? couponResult.coupon.code : undefined,
          couponId: couponResult.coupon ? couponResult.coupon._id : undefined,

          amount: finalAmount,
          currency: 'INR',
          paymentStatus: 'pending',
          paymentGateway: 'manual',
          requiresManualReview: true,
          paymentMethod: { type: 'upi' },

          customerDetails: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            bgmiId: user.bgmiId,
            inGameName: user.inGameName
          },
          metadata: {
            pricing: { baseAmount, discountAmount, finalAmount },
            coupon: couponResult.coupon
              ? { code: couponResult.coupon.code, type: couponResult.coupon.discountType, value: couponResult.coupon.discountValue }
              : null
          }
        });
      }
    }

    const participantPaymentStatus =
      tournament.isFree ? 'paid' : (finalAmount === 0 ? 'paid' : 'pending');

    tournament.participants.push({
      userId: req.user.id,
      bgmiId: user.bgmiId,
      inGameName: user.inGameName,
      paymentStatus: participantPaymentStatus,
      paymentId: payment?._id,
      partnerInfo
    });

    tournament.currentParticipants += 1;
    tournament.registrationCount += 1;
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Registered successfully',
      payableAmount: tournament.isFree ? 0 : finalAmount,
      discount: { baseAmount, discountAmount, couponCode: couponResult.coupon?.code || null },
      payment: payment ? {
        id: payment._id,
        amount: payment.amount,
        invoiceId: payment.invoiceId,
        paymentStatus: payment.paymentStatus,
        paymentGateway: payment.paymentGateway
      } : null,
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register squad for tournament
// @route   POST /api/tournaments/:id/register-squad
// @access  Private
exports.registerSquad = async (req, res, next) => {
  try {
    const { teamName, members, couponCode } = req.body;

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.tournamentType !== 'squad') {
      return res.status(400).json({ success: false, message: 'This is not a squad tournament' });
    }

    const now = new Date();
    const regStart = new Date(tournament.registrationStartDate);
    const regEnd = new Date(tournament.registrationEndDate);

    if (now < regStart) return res.status(400).json({ success: false, message: 'Registration has not started yet' });
    if (now > regEnd) return res.status(400).json({ success: false, message: 'Registration period has ended' });

    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return res.status(400).json({ success: false, message: 'Tournament is full' });
    }

    const user = await User.findById(req.user.id);
    if (!user.bgmiId || !user.inGameName) {
      return res.status(400).json({ success: false, message: 'Please complete your profile with BGMI ID and In-Game Name' });
    }

    const totalMembers = members.length + 1;
    if (totalMembers !== tournament.teamSize) {
      return res.status(400).json({ success: false, message: `Squad must have exactly ${tournament.teamSize} members` });
    }

    const allBgmiIds = [user.bgmiId, ...members.map(m => m.bgmiId)];
    const uniqueBgmiIds = new Set(allBgmiIds);
    if (uniqueBgmiIds.size !== allBgmiIds.length) {
      return res.status(400).json({ success: false, message: 'Duplicate BGMI IDs not allowed in same squad' });
    }

    const existingTeam = await TournamentTeam.findOne({
      tournamentId: tournament._id,
      'captain.userId': req.user.id
    });

    if (existingTeam) {
      return res.status(400).json({ success: false, message: 'You have already registered a squad for this tournament' });
    }

    const bgmiAlreadyInAnyTeam = await TournamentTeam.findOne({
      tournamentId: tournament._id,
      $or: [
        { 'captain.bgmiId': { $in: allBgmiIds } },
        { 'members.bgmiId': { $in: allBgmiIds } }
      ]
    }).select('_id');

    if (bgmiAlreadyInAnyTeam) {
      return res.status(400).json({ success: false, message: 'One or more BGMI IDs are already registered in this tournament' });
    }

    const team = await TournamentTeam.create({
      tournamentId: tournament._id,
      teamName: teamName || `${user.name}'s Squad`,
      captain: {
        userId: req.user.id,
        bgmiId: user.bgmiId,
        inGameName: user.inGameName
      },
      members: members.map(m => ({
        bgmiId: m.bgmiId,
        inGameName: m.inGameName,
        status: 'confirmed'
      })),
      registrationStatus: 'registered'
    });

    let payment = null;

    const baseAmount = tournament.isFree ? 0 : (tournament.serviceFee || 0);

    const couponResult = await validateAndApplyCoupon({
      couponCode,
      user,
      tournament,
      baseAmount
    });

    const finalAmount = couponResult.finalAmount;
    const discountAmount = couponResult.discountAmount;

    if (!tournament.isFree) {
      if (finalAmount === 0) {
        payment = await Payment.create({
          paymentType: 'team',
          userId: req.user.id,
          tournamentId: tournament._id,
          teamId: team._id,
          payingCaptainId: req.user.id,
          coveredUsers: [
            { userId: req.user.id, bgmiId: user.bgmiId, inGameName: user.inGameName, isCaptain: true },
            ...members.map(m => ({ bgmiId: m.bgmiId, inGameName: m.inGameName, isCaptain: false }))
          ],

          baseAmount,
          discountAmount,
          couponCode: couponResult.coupon ? couponResult.coupon.code : undefined,
          couponId: couponResult.coupon ? couponResult.coupon._id : undefined,

          amount: 0,
          currency: 'INR',
          paymentStatus: 'success',
          paymentGateway: 'manual',
          paymentMethod: { type: 'coupon' },

          customerDetails: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            bgmiId: user.bgmiId,
            inGameName: user.inGameName
          },
          metadata: {
            pricing: { baseAmount, discountAmount, finalAmount },
            coupon: couponResult.coupon
              ? { code: couponResult.coupon.code, type: couponResult.coupon.discountType, value: couponResult.coupon.discountValue }
              : null
          }
        });

        if (couponResult.coupon) {
          await markCouponUsed({ couponId: couponResult.coupon._id, userId: user._id });
        }

        team.paymentId = payment._id;
        team.paymentStatus = 'paid';
        await team.save();
      } else {
        // ✅ SWITCH TO MANUAL (NO RAZORPAY)
        payment = await Payment.create({
          paymentType: 'team',
          userId: req.user.id,
          tournamentId: tournament._id,
          teamId: team._id,
          payingCaptainId: req.user.id,
          coveredUsers: [
            { userId: req.user.id, bgmiId: user.bgmiId, inGameName: user.inGameName, isCaptain: true },
            ...members.map(m => ({ bgmiId: m.bgmiId, inGameName: m.inGameName, isCaptain: false }))
          ],

          baseAmount,
          discountAmount,
          couponCode: couponResult.coupon ? couponResult.coupon.code : undefined,
          couponId: couponResult.coupon ? couponResult.coupon._id : undefined,

          amount: finalAmount,
          currency: 'INR',
          paymentStatus: 'pending',
          paymentGateway: 'manual',
          requiresManualReview: true,
          paymentMethod: { type: 'upi' },

          customerDetails: {
            name: user.name,
            email: user.email,
            phone: user.phone,
            bgmiId: user.bgmiId,
            inGameName: user.inGameName
          },
          metadata: {
            pricing: { baseAmount, discountAmount, finalAmount },
            coupon: couponResult.coupon
              ? { code: couponResult.coupon.code, type: couponResult.coupon.discountType, value: couponResult.coupon.discountValue }
              : null
          }
        });

        team.paymentId = payment._id;
        team.paymentStatus = 'pending';
        await team.save();
      }
    } else {
      team.paymentStatus = 'paid';
      await team.save();
    }

    tournament.currentParticipants += 1;
    tournament.registrationCount += 1;
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Squad registered successfully',
      payableAmount: tournament.isFree ? 0 : finalAmount,
      discount: { baseAmount, discountAmount, couponCode: couponResult.coupon?.code || null },
      payment: payment ? {
        id: payment._id,
        amount: payment.amount,
        invoiceId: payment.invoiceId,
        paymentStatus: payment.paymentStatus,
        paymentGateway: payment.paymentGateway
      } : null,
      data: team
    });
  } catch (error) {
    next(error);
  }
};

// Leaderboard + participants count remain unchanged...
exports.getLeaderboard = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    let leaderboard;

    if (tournament.tournamentType === 'squad') {
      leaderboard = await TournamentTeam.find({
        tournamentId: tournament._id,
        registrationStatus: { $in: ['registered', 'verified'] }
      })
        .populate('captain.userId', 'name inGameName')
        .sort({ totalPoints: -1, totalKills: -1 })
        .select('teamName captain members totalKills totalPoints placement');
    } else {
      leaderboard = tournament.participants
        .filter(p => p.paymentStatus === 'paid')
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return b.totalKills - a.totalKills;
        })
        .map((p, index) => ({
          rank: index + 1,
          userId: p.userId,
          inGameName: p.inGameName,
          bgmiId: p.bgmiId,
          totalKills: p.totalKills,
          totalPoints: p.totalPoints
        }));
    }

    res.status(200).json({
      success: true,
      tournamentType: tournament.tournamentType,
      data: leaderboard
    });
  } catch (error) {
    next(error);
  }
};

exports.getTournamentParticipants = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    let individualParticipants = 0;
    let teamsCount = 0;

    if (tournament.tournamentType === 'squad') {
      teamsCount = await TournamentTeam.countDocuments({
        tournamentId: tournament._id,
        registrationStatus: { $in: ['registered', 'verified'] }
      });

      individualParticipants = teamsCount * 4;
    } else {
      individualParticipants = tournament.participants.filter(p => p.paymentStatus === 'paid').length;
    }

    res.status(200).json({
      success: true,
      data: {
        totalParticipants: tournament.currentParticipants,
        individualParticipants,
        teamsCount,
        tournamentType: tournament.tournamentType
      }
    });
  } catch (error) {
    next(error);
  }
};