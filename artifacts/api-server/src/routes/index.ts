import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import groupsRouter from "./groups";
import invitationsRouter from "./invitations";
import expensesRouter from "./expenses";
import settlementsRouter from "./settlements";
import recurringRouter from "./recurring";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import importsRouter from "./imports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(groupsRouter);
router.use(invitationsRouter);
router.use(expensesRouter);
router.use(settlementsRouter);
router.use(recurringRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(importsRouter);

export default router;
