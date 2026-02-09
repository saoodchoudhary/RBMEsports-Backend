const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const MatchResult = require('../models/MatchResult');
const WinnerProfile = require('../models/WinnerProfile');
const User = require('../models/User');
const Payment = require('../models/Payment');

// NEW
const Wallet = require("../models/Wallet");

// helper: get or create wallet
async function getOrCreateWallet(userId) {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) wallet = await Wallet.create({ userId });
  return wallet;
}

// @desc    Create tournament
// @route   POST /api/admin/tournaments
// @access  Private/Admin
exports.createTournament = async (req, res, next) => {
  try {
    const tournamentData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const tournament = await Tournament.create(tournamentData);
    
    res.status(201).json({
      success: true,
      message: 'Tournament created successfully',
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update tournament
// @route   PUT /api/admin/tournaments/:id
// @access  Private/Admin
exports.updateTournament = async (req, res, next) => {
  try {
    const { id } = req.params;

    // ✅ guard invalid id
    if (!id || id === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Tournament id is required"
      });
    }

    const tournament = await Tournament.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tournament updated successfully',
      data: tournament
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete tournament
// @route   DELETE /api/admin/tournaments/:id
// @access  Private/Admin
exports.deleteTournament = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    // Only allow deletion if no participants
    if (tournament.currentParticipants > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tournament with participants'
      });
    }
    
    await tournament.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Tournament deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit match result
// @route   POST /api/admin/tournaments/:id/results
// @access  Private/Admin
exports.submitMatchResult = async (req, res, next) => {
  try {
    const { matchNumber, matchDay, map, matchType, results } = req.body;
    
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    // Calculate points for each result
    const processedResults = results.map(result => {
      const placementPoint = tournament.placementPoints.find(
        p => p.placement === result.placement
      );
      
      return {
        ...result,
        placementPoints: placementPoint?.points || 0,
        killPoints: result.kills * tournament.killPoints,
        totalPoints: (placementPoint?.points || 0) + (result.kills * tournament.killPoints)
      };
    });
    
    // Create match result
    const matchResult = await MatchResult.create({
      tournamentId: tournament._id,
      matchNumber,
      matchDay,
      map,
      matchType,
      results: processedResults,
      submittedBy: req.user.id,
      verificationStatus: 'verified'
    });
    
    // Update tournament participants/teams with points
    if (tournament.tournamentType === 'squad') {
      for (const result of processedResults) {
        await TournamentTeam.findOneAndUpdate(
          { 
            tournamentId: tournament._id,
            teamName: result.teamName
          },
          {
            $inc: {
              totalKills: result.kills,
              totalPoints: result.totalPoints
            }
          }
        );
      }
    } else {
      for (const result of processedResults) {
        const participantIndex = tournament.participants.findIndex(
          p => p.userId.toString() === result.userId.toString()
        );
        
        if (participantIndex !== -1) {
          tournament.participants[participantIndex].totalKills += result.kills;
          tournament.participants[participantIndex].totalPoints += result.totalPoints;
        }
      }
      await tournament.save();
    }
    
    res.status(201).json({
      success: true,
      message: 'Match result submitted successfully',
      data: matchResult
    });
  } catch (error) {
    next(error);
  }
};


// @desc Declare winners
exports.declareWinners = async (req, res, next) => {
  try {
    const { winners } = req.body; // [{ userId/teamId, rank, prizeAmount }, ...]

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    // Clear existing winners
    tournament.winners = [];

    // Add new winners
    for (const winner of winners) {
      tournament.winners.push({
        userId: winner.userId,
        teamId: winner.teamId,
        rank: winner.rank,
        prizeAmount: winner.prizeAmount,
        isPaid: true // IMPORTANT: since we are crediting wallet now
      });

      // Create winner profile
      await WinnerProfile.create({
        tournamentId: tournament._id,
        userId: winner.userId,
        teamId: winner.teamId,
        rank: winner.rank,
        prizeAmount: winner.prizeAmount,
        totalKills: winner.totalKills || 0,
        totalPoints: winner.totalPoints || 0,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        paymentStatus: "paid",
        paidAt: new Date()
      });

      // Determine payout receiver
      let receiverUserId = winner.userId;

      // If squad: credit captain (from TournamentTeam)
      if (tournament.tournamentType === "squad" && winner.teamId) {
        const team = await TournamentTeam.findById(winner.teamId).select("captain");
        if (team?.captain?.userId) receiverUserId = team.captain.userId;
      }

      if (receiverUserId) {
        const wallet = await getOrCreateWallet(receiverUserId);
        await wallet.addMoney(
          Number(winner.prizeAmount),
          "prize_won",
          `Prize won: ${tournament.title} (Rank #${winner.rank})`,
          { tournamentId: tournament._id }
        );
      }

      // Update user stats (optional: keep your existing logic)
      if (winner.userId) {
        await User.findByIdAndUpdate(winner.userId, {
          $inc: {
            tournamentsWon: winner.rank === 1 ? 1 : 0,
            totalPrizeMoney: winner.prizeAmount
          },
          $push: {
            tournaments: {
              tournamentId: tournament._id,
              status: 'won',
              rank: winner.rank,
              prizeWon: winner.prizeAmount
            }
          }
        });
      }
    }

    tournament.status = 'completed';
    await tournament.save();

    res.status(200).json({ success: true, message: 'Winners declared successfully', data: tournament });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all participants
// @route   GET /api/admin/tournaments/:id/participants
// @access  Private/Admin
exports.getParticipants = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    let participants;
    
    if (tournament.tournamentType === 'squad') {
      participants = await TournamentTeam.find({
        tournamentId: tournament._id
      })
        .populate('captain.userId', 'name email phone')
        .populate('paymentId');
    } else {
      participants = await Tournament.findById(req.params.id)
        .populate('participants.userId', 'name email phone')
        .populate('participants.paymentId');
    }
    
    res.status(200).json({
      success: true,
      data: participants
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify payment manually
// @route   PUT /api/admin/payments/:id/verify
// @access  Private/Admin
exports.verifyPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.paymentStatus = 'success';
    payment.isVerified = true;
    payment.verifiedBy = req.user.id;
    payment.verifiedAt = new Date();
    await payment.save();
    
    // Update tournament participant status
    const tournament = await Tournament.findById(payment.tournamentId);
    
    if (payment.paymentType === 'team') {
      await TournamentTeam.findByIdAndUpdate(payment.teamId, {
        paymentStatus: 'paid'
      });
    } else {
      const participantIndex = tournament.participants.findIndex(
        p => p.userId.toString() === payment.userId.toString()
      );
      if (participantIndex !== -1) {
        tournament.participants[participantIndex].paymentStatus = 'paid';
        await tournament.save();
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = async (req, res, next) => {
  try {
    const totalTournaments = await Tournament.countDocuments();
    const activeTournaments = await Tournament.countDocuments({
      status: { $in: ['registration_open', 'ongoing'] }
    });
    const totalUsers = await User.countDocuments();
    const totalRevenue = await Payment.aggregate([
      { $match: { paymentStatus: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const recentRegistrations = await Payment.find({
      paymentStatus: 'success'
    })
      .populate('userId', 'name email')
      .populate('tournamentId', 'title')
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.status(200).json({
      success: true,
      data: {
        totalTournaments,
        activeTournaments,
        totalUsers,
        totalRevenue: totalRevenue[0]?.total || 0,
        recentRegistrations
      }
    });
  } catch (error) {
    next(error);
  }
};